/* Pure transformation. No network, filesystem, database, model calls or sending. */
'use strict';

function prepareReview(envelope, processedAt = new Date().toISOString()) {
  if (!envelope || !Array.isArray(envelope.inquiries)) throw new Error('Expected an inquiries array.');
  if (!Array.isArray(envelope.existing_contacts)) throw new Error('Expected existing_contacts array; use [] only when no index is available.');
  if (envelope.inquiries.length > 1000 || envelope.existing_contacts.length > 10000) throw new Error('Batch exceeds review limit. Split the batch.');
  const text = (value) => typeof value === 'string' ? value.trim() : '';
  const timestamp = (value) => {
    const s = text(value);
    return /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null;
  };
  if (!timestamp(processedAt)) throw new Error('processedAt must include a valid timezone.');
  const phone = (value) => {
    const s = text(value);
    if (!s || /(?:ext\.?|x|#)\s*\d+/i.test(s)) return null;
    const digits = s.replace(/\D/g, '');
    if (/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return '+1' + digits;
    if (/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return '+' + digits;
    return null; // Do not guess non-NANP numbers or strip extensions.
  };
  const email = (value) => {
    const s = text(value).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
  };
  const keys = (row) => [phone(row.phone) && 'phone:' + phone(row.phone), email(row.email) && 'email:' + email(row.email)].filter(Boolean);
  const lookup = new Map();
  for (const [index, contact] of envelope.existing_contacts.entries()) {
    if (!contact || typeof contact !== 'object' || Array.isArray(contact)) throw new Error('Each existing contact must be an object.');
    for (const key of keys(contact)) {
      if (!lookup.has(key)) lookup.set(key, []);
      lookup.get(key).push(text(contact.id) || 'contact-index:' + index);
    }
  }
  const inquiryKeys = envelope.inquiries.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Each inquiry must be an object.');
    return keys(row);
  });
  const sourceKeys = envelope.inquiries.map((row) => text(row.source) && text(row.source_id)
    ? encodeURIComponent(text(row.source)) + ':' + encodeURIComponent(text(row.source_id)) : null);
  return envelope.inquiries.map((row, index) => {
    const missing = [];
    const source = text(row.source) || null;
    const sourceId = text(row.source_id) || null;
    const receivedAt = timestamp(row.received_at);
    const lastConfirmedAt = timestamp(row.last_confirmed_at);
    const normalizedPhone = phone(row.phone);
    const normalizedEmail = email(row.email);
    const address = text(row.property_address) || null;
    const town = text(row.town).toLowerCase().replace(/\s+/g, ' ');
    const region = text(row.region).toUpperCase();
    const neighborhood = text(row.neighborhood).toLowerCase();
    const photos = Array.isArray(row.photo_refs) ? row.photo_refs.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim()) : [];
    if (!source) missing.push('source');
    if (!sourceId) missing.push('source_id');
    if (!receivedAt) missing.push('received_at_with_timezone');
    if (!lastConfirmedAt) missing.push('last_confirmed_at');
    if (!text(row.name)) missing.push('name');
    if (!normalizedPhone && !normalizedEmail) missing.push('usable_contact');
    if (text(row.phone) && !normalizedPhone) missing.push('phone_format_or_extension');
    if (text(row.email) && !normalizedEmail) missing.push('email_format');
    if (!address) missing.push('property_address');
    if (!town || !region) missing.push('town_and_region');
    if (!photos.length) missing.push('property_photos');
    if (!text(row.service_requested)) missing.push('service_requested');
    const matches = [...new Set(inquiryKeys[index].flatMap((key) => lookup.get(key) || []))];
    const relatedBatch = envelope.inquiries.flatMap((_, j) => j !== index && inquiryKeys[index].some((key) => inquiryKeys[j].includes(key)) ? [j] : []);
    const repeatSources = sourceKeys[index] ? sourceKeys.flatMap((key, j) => j !== index && key === sourceKeys[index] ? [j] : []) : [];
    const possibleDuplicate = matches.length > 0 || relatedBatch.length > 0 || repeatSources.length > 0;
    let routeFit = 'needs_location_verification';
    if (town && region) routeFit = (region === 'RI' || region === 'RHODE ISLAND') && ['smithfield', 'greenville'].includes(town) ? 'core_area_candidate' : 'route_review_required';
    if (town === 'esmond' || neighborhood === 'esmond') routeFit = 'excluded_area_review';
    const asks = [];
    if (!address) asks.push('the property address');
    if (!photos.length) asks.push('a few current photos of the areas needing work');
    if (!text(row.service_requested)) asks.push('which services you need');
    const request = asks.length ? ' Could you send ' + asks.join(', ').replace(/, ([^,]*)$/, ' and $1') + '?' : ' I’ll review the details before confirming a price or availability.';
    const reply = 'Hi, thanks for reaching out to WeedEater Lawn Care.' + request;
    return {
      schema_version: 1,
      review_key: sourceKeys[index],
      review_status: 'needs_verification',
      source,
      source_id: sourceId,
      source_url: text(row.source_url) || null,
      received_at: receivedAt,
      processed_at: timestamp(processedAt),
      last_confirmed_at: lastConfirmedAt,
      last_confirmed_at_status: lastConfirmedAt ? 'source_claim_unverified' : 'unknown',
      raw_source_payload: JSON.parse(JSON.stringify(row)),
      customer: {name: text(row.name) || null, phone: normalizedPhone, email: normalizedEmail},
      property: {address, town: text(row.town) || null, region: text(row.region) || null, neighborhood: text(row.neighborhood) || null, photo_refs: photos},
      service_requested: text(row.service_requested) || null,
      message: text(row.message) || null,
      duplicate_review: {
        possible_duplicate: possibleDuplicate,
        exact_contact_candidates: matches,
        related_batch_indexes: relatedBatch,
        repeat_source_batch_indexes: repeatSources,
        keys: inquiryKeys[index],
        contact_index_status: envelope.existing_contacts.length ? 'provided_index_unverified' : 'no_contact_index_provided',
        automatically_merged: false,
      },
      route_fit: routeFit,
      route_fit_note: 'Area screening only. Verify the exact address, neighborhood, travel and existing route before accepting.',
      missing_or_unverified: missing,
      price: null,
      scheduled_at: null,
      follow_up_due_at: null,
      next_action: possibleDuplicate ? 'review_matching_conversations_before_contact' : 'review_source_and_draft',
      draft: {status: 'draft_only', body: reply, requires_owner_review: true, contact_hold: possibleDuplicate, sent: false},
      persistence: 'returned_to_caller_only',
    };
  });
}

module.exports = {prepareReview};

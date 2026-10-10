# Client address map links — October 10, 2026

Request: clicking a property address within a client must open that address in Maps, with Google and Apple choices.

Cause: the client Properties list rendered every address as an internal /properties/:id link. Confirmed on the authenticated production client screen, including a client with two properties.

Change: address text opens Google Maps; explicit Google Maps and Apple Maps links use that property's street, city, state and ZIP. Property details has a separate link. All controls have at least 44px height, wrap on narrow screens, and use visible keyboard focus. External destinations open separately with noopener/noreferrer. No business data writes or API keys.

Missing streets show an unavailable message with property details still accessible. No nickname or city-only destination is inferred.

Validation: three server-rendered client-page regressions failed on the original implementation and pass after the repair. They cover complete address encoding (including # and &), independent destinations for two properties, both providers, external link safety, and a missing street. Included in existing isolated CI gate. Live release verification follows deployment; no physical iPhone test claimed.

Provider URL references:
- https://developers.google.com/maps/documentation/urls/get-started
- https://developer.apple.com/documentation/mapkit/unified-map-urls

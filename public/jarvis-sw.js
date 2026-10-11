/* Only opt-in Web Push delivery. This worker does not cache private pages. */
self.addEventListener('push', event => {
 let data;try{data=event.data?.json();}catch{return;}
 if(!data||typeof data.tag!=='string')return;
 event.waitUntil(self.registration.showNotification('Jarvis',{body:typeof data.body==='string'?data.body:'Your activity is ready.',tag:data.tag,renotify:false,data:{url:'/workshop'}}));
});
self.addEventListener('notificationclick', event => {
 event.notification.close();
 event.waitUntil((async()=>{const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});const client=all.find(c=>new URL(c.url).origin===self.location.origin);if(client){await client.focus();if('navigate' in client)await client.navigate('/workshop');}else await self.clients.openWindow('/workshop');})());
});

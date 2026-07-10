addEventListener('fetch', event => {
  event.respondWith(new Response(JSON.stringify({stickers:[]}),{headers:{'content-type':'application/json'}}));
});
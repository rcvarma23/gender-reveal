addEventListener('fetch', event => {
  event.respondWith(new Response(JSON.stringify({videoUrl:''}),{headers:{'content-type':'application/json'}}));
});
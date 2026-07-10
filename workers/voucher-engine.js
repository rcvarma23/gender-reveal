addEventListener('fetch', event => {
  event.respondWith(new Response(JSON.stringify({vouchers:[]}),{headers:{'content-type':'application/json'}}));
});
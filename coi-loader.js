const script = document.createElement('script');
script.async = false;
script.src = new URL('coi-serviceworker.js', window.location.href).href;
document.head.appendChild(script);

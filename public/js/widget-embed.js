/**
 * Agente IA — Script de Embed
 * Pegá este script en cualquier web para agregar el chat.
 * Desarrollado por Aaron Rodriguez
 */
(function () {
  var cfg = window.AgenteIA || {};
  var serverUrl = cfg.serverUrl || 'http://localhost:3000';

  // Crear iframe
  var iframe = document.createElement('iframe');
  iframe.src = serverUrl + '/widget';
  iframe.id = 'agente-ia-frame';
  iframe.style.cssText = [
    'position:fixed',
    'bottom:0',
    'right:0',
    'width:420px',
    'height:640px',
    'border:none',
    'z-index:2147483647',
    'background:transparent',
    'pointer-events:auto',
  ].join(';');

  // Posición configurable
  if (cfg.position === 'bottom-left') {
    iframe.style.right = 'auto';
    iframe.style.left = '0';
  }

  document.body.appendChild(iframe);
})();

/* Pago automático con Mercado Pago.
   Si el cobro automático no está activo (faltan las claves en Vercel), no hace nada
   y los botones siguen yendo a WhatsApp como siempre. */
(function () {
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var VID = window.VIDS || {};
  var P = window.PROMO, fin = P ? new Date(P.hasta).getTime() : 0;
  var promoOn = !!P && !isNaN(fin) && Date.now() < fin;
  var precio = function (p) { return promoOn ? Math.round(p * (100 - P.porcentaje) / 100) : p; };
  var fmt = function (n) { return "$" + Math.round(n).toLocaleString("es-AR"); };
  var SUITE = "50308363387237";

  /* Desde la web principal: #planillas-sueltas abre la lista de planillas sueltas */
  if (location.hash === "#planillas-sueltas") { var ds = document.getElementById("planillas-sueltas"); if (ds) ds.open = true; }

  fetch("/api/estado").then(function (r) { return r.json(); }).then(function (e) { if (e && e.activo) iniciar(); }).catch(function () {});

  function iniciar() {
    document.body.classList.add("pago-auto");
    var go = $("#cart-go"); if (go) { go.textContent = "Ir a pagar ❯"; go.removeAttribute("target"); }
    document.querySelectorAll("[data-auto]").forEach(function (el) { el.innerHTML = el.getAttribute("data-auto"); });
    armarVentana();
    document.addEventListener("click", function (e) {
      var a = e.target.closest("[data-vid], #cart-go, .js-suite");
      if (!a) return;
      var ids = [];
      if (a.id === "cart-go") ids = (window.PM_SEL || []).map(function (x) { return x.id; });
      else if (a.classList.contains("js-suite")) {
        ids = [SUITE]; var b = $(".bump-chk"); if (b && b.checked) ids.push(b.dataset.id);
      } else ids = [a.dataset.vid];
      ids = ids.filter(function (id) { return VID[id]; });
      if (!ids.length) return;
      e.preventDefault();
      abrir(ids, a.href);
    }, true);

    /* Link directo desde la web principal: ?comprar=CÓDIGO (o varios separados por coma) abre el pago */
    var q = new URLSearchParams(location.search).get("comprar");
    if (q) {
      var lista = q.split(",").filter(function (id) { return VID[id]; });
      if (lista.length) {
        abrir(lista, "");
        if (window.fbq) fbq("track", "InitiateCheckout", { value: lista.reduce(function (a, id) { return a + precio(VID[id][1]); }, 0), currency: "ARS", num_items: lista.length });
      }
      try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
    }
  }

  var css = '#pm-pago{position:fixed;inset:0;z-index:9999;background:rgba(18,46,84,.55);display:flex;align-items:center;justify-content:center;padding:16px}' +
    '#pm-pago[hidden]{display:none}' +
    '#pm-pago .caja{background:#fff;color:#122e54;width:100%;max-width:440px;border-radius:26px;padding:26px 24px 22px;box-shadow:0 24px 60px rgba(0,0,0,.3);position:relative;max-height:92vh;overflow:auto;font-family:inherit}' +
    '#pm-pago h3{font-size:24px;line-height:1.1;margin:0 0 4px}#pm-pago .sub{color:#5b6474;font-size:14px;margin:0 0 16px}' +
    '#pm-pago ul{list-style:none;margin:0 0 6px;padding:12px 14px;background:#f6f4ec;border-radius:16px;font-size:14px}#pm-pago li{display:flex;justify-content:space-between;gap:10px;padding:3px 0}' +
    '#pm-pago .tot{display:flex;justify-content:space-between;font-weight:900;font-size:18px;padding:6px 14px 0}#pm-pago .cuo{text-align:right;font-size:13px;color:#5b6474;padding:0 14px 14px}' +
    '#pm-pago label{display:block;font-weight:800;font-size:13px;margin:10px 0 4px}#pm-pago input{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:2px solid #d9d5c7;border-radius:14px;color:#122e54}' +
    '#pm-pago input:focus{outline:none;border-color:#1e4982}#pm-pago .ayuda{font-size:12px;color:#5b6474;margin-top:4px}' +
    '#pm-pago button.pagar{width:100%;margin-top:18px;font:inherit;font-weight:900;font-size:17px;padding:15px;border-radius:999px;border:0;background:#ffe500;color:#122e54;cursor:pointer}' +
    '#pm-pago button.pagar:disabled{opacity:.6;cursor:wait}#pm-pago .err{color:#c0392b;font-size:14px;font-weight:700;margin-top:10px}' +
    '#pm-pago .x{position:absolute;top:12px;right:14px;border:0;background:none;font-size:26px;line-height:1;cursor:pointer;color:#5b6474}' +
    '#pm-pago .seg{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;font-size:12px;color:#5b6474;margin-top:12px;text-align:center}' +
    '#pm-pago .ws{display:block;text-align:center;font-size:13px;margin-top:10px;color:#1e4982}';

  var caja, ids = [], wsp = "";
  function armarVentana() {
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    caja = document.createElement("div"); caja.id = "pm-pago"; caja.hidden = true;
    caja.innerHTML = '<div class="caja" role="dialog" aria-modal="true" aria-labelledby="pm-t">' +
      '<button class="x" type="button" aria-label="Cerrar">×</button>' +
      '<h3 id="pm-t">Último paso</h3><p class="sub">Pagás en Mercado Pago y los archivos te llegan solos a tu mail apenas se acredita.</p>' +
      '<ul id="pm-items"></ul><div class="tot"><span>Total</span><span id="pm-tot"></span></div><div class="cuo" id="pm-cuo"></div>' +
      '<form id="pm-form" novalidate><label for="pm-n">Tu nombre</label><input id="pm-n" autocomplete="name" placeholder="Nombre y apellido">' +
      '<label for="pm-e">Tu email</label><input id="pm-e" type="email" autocomplete="email" inputmode="email" placeholder="tunombre@gmail.com" required>' +
      '<div class="ayuda">Acá te mandamos los links de descarga. Revisalo bien.</div>' +
      '<div class="err" id="pm-err" hidden></div><button class="pagar" type="submit">Pagar con Mercado Pago ❯</button></form>' +
      '<div class="seg"><span>🔒 Pago seguro en Mercado Pago</span><span>·</span><span>💳 Hasta 3 cuotas</span><span>·</span><span>🛡️ Garantía 7 días</span></div>' +
      '<a class="ws" id="pm-ws" target="_blank" rel="noopener">¿Preferís comprar por WhatsApp?</a></div>';
    document.body.appendChild(caja);
    caja.addEventListener("click", function (e) { if (e.target === caja || e.target.classList.contains("x")) cerrar(); });
    addEventListener("keydown", function (e) { if (e.key === "Escape" && !caja.hidden) cerrar(); });
    $("#pm-form").addEventListener("submit", pagar);
    try { $("#pm-e").value = localStorage.getItem("pm_email") || ""; $("#pm-n").value = localStorage.getItem("pm_nombre") || ""; } catch (e) {}
  }

  function abrir(lista, linkWsp) {
    ids = lista; wsp = linkWsp || "https://wa.me/5493425104877";
    var tot = 0;
    $("#pm-items").innerHTML = lista.map(function (id) { var v = VID[id], p = precio(v[1]); tot += p; return "<li><span>" + v[0] + "</span><b>" + fmt(p) + "</b></li>"; }).join("");
    $("#pm-tot").textContent = fmt(tot);
    $("#pm-cuo").textContent = "o 3 cuotas sin interés de " + fmt(Math.ceil(tot / 3)) + (promoOn ? " · con " + P.porcentaje + "% OFF aplicado" : "");
    $("#pm-ws").href = wsp; $("#pm-err").hidden = true;
    caja.hidden = false; document.body.style.overflow = "hidden";
    setTimeout(function () { ($("#pm-e").value ? $(".pagar", caja) : $("#pm-n").value ? $("#pm-e") : $("#pm-n")).focus(); }, 50);
  }
  function cerrar() { caja.hidden = true; document.body.style.overflow = ""; }

  function error(t) { var e = $("#pm-err"); e.innerHTML = t; e.hidden = false; }

  function pagar(e) {
    e.preventDefault();
    var email = $("#pm-e").value.trim(), nombre = $("#pm-n").value.trim(), btn = $(".pagar", caja);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { error("Revisá el email, así te llegan los archivos."); $("#pm-e").focus(); return; }
    try { localStorage.setItem("pm_email", email); localStorage.setItem("pm_nombre", nombre); } catch (er) {}
    btn.disabled = true; btn.textContent = "Abriendo Mercado Pago…"; $("#pm-err").hidden = true;
    if (window.fbq) fbq("track", "AddPaymentInfo", { value: ids.reduce(function (a, id) { return a + precio(VID[id][1]); }, 0), currency: "ARS", num_items: ids.length });
    fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: ids, email: email, nombre: nombre }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok || !d.url) throw new Error(d.error || "error"); return d; }); })
      .then(function (d) { location.href = d.url; })
      .catch(function () {
        btn.disabled = false; btn.textContent = "Pagar con Mercado Pago ❯";
        error('No pudimos abrir el pago. Probá de nuevo o <a href="' + wsp + '" target="_blank" rel="noopener">compralo por WhatsApp</a>.');
      });
  }
})();

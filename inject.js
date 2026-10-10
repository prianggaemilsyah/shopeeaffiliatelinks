(function() {
    'use strict';

    // Script ini dijalankan di MAIN world (dunia halaman Shopee) oleh manifest.
    // Tugasnya: menangkap isi CSV hasil "Buat Link Massal" lalu mengirimnya ke
    // content script (isolated world) via window.postMessage.

    var armed = false;
    var sent = false;

    function looksLikeCSV(t) {
        if (!t || typeof t !== 'string') return false;
        var firstLine = t.split(/\r?\n/, 1)[0] || '';
        if (firstLine.length > 1000) return false;
        var hasHeader = firstLine.indexOf('ID Produk') !== -1 ||
            firstLine.indexOf('Link Komisi') !== -1 ||
            (firstLine.indexOf('Komisi') !== -1 && firstLine.indexOf('Produk') !== -1);
        var hasDelim = firstLine.indexOf('\t') !== -1 ||
            firstLine.indexOf(',') !== -1 ||
            firstLine.indexOf(';') !== -1;
        return hasHeader && hasDelim;
    }

    function send(text) {
        if (!armed || sent || !looksLikeCSV(text)) return;
        sent = true;
        try {
            window.postMessage({ __shopeeExtractorCSV: true, text: text }, '*');
        } catch (e) {}
    }

    window.addEventListener('message', function(e) {
        if (e.source !== window) return;
        var d = e.data;
        if (!d || typeof d !== 'object') return;
        if (d.__shopeeExtractorArm) { armed = true; sent = false; }
        if (d.__shopeeExtractorDisarm) { armed = false; }
    });

    // --- fetch ---
    var origFetch = window.fetch;
    if (typeof origFetch === 'function') {
        window.fetch = function() {
            var p = origFetch.apply(this, arguments);
            if (armed && !sent) {
                try {
                    p.then(function(resp) {
                        if (resp && typeof resp.clone === 'function') {
                            resp.clone().text().then(send).catch(function() {});
                        }
                    }).catch(function() {});
                } catch (e) {}
            }
            return p;
        };
    }

    // --- XMLHttpRequest ---
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function() {
        try { this.__seUrl = arguments[1]; } catch (e) {}
        return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
        var xhr = this;
        if (armed && !sent) {
            try {
                xhr.addEventListener('load', function() {
                    try { send(xhr.responseText); } catch (e) {}
                });
            } catch (e) {}
        }
        return origSend.apply(this, arguments);
    };

    // --- Blob URL (paling umum untuk download CSV) ---
    var origCreateObjectURL = URL.createObjectURL;
    if (typeof origCreateObjectURL === 'function') {
        URL.createObjectURL = function(blob) {
            if (armed && !sent && blob && typeof blob.text === 'function') {
                blob.text().then(send).catch(function() {});
            }
            return origCreateObjectURL.apply(URL, arguments);
        };
    }

    // --- Anchor download (href langsung ke server) ---
    var origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
        try {
            if (armed && !sent) {
                var href = this.href || '';
                var isDownload = this.hasAttribute('download') ||
                    href.indexOf('csv') !== -1 || href.indexOf('export') !== -1 ||
                    href.indexOf('link') !== -1;
                if (isDownload && href && href.indexOf('blob:') !== 0 && href.indexOf('javascript:') !== 0) {
                    origFetch.call(window, href, { credentials: 'include' })
                        .then(function(r) { return r.text(); })
                        .then(send)
                        .catch(function() {});
                }
            }
        } catch (e) {}
        return origAnchorClick.apply(this, arguments);
    };

    // --- window.open ---
    var origWindowOpen = window.open;
    if (typeof origWindowOpen === 'function') {
        window.open = function(url) {
            try {
                if (armed && !sent && url && typeof url === 'string' &&
                    url.indexOf('blob:') !== 0 && url.indexOf('javascript:') !== 0) {
                    origFetch.call(window, url, { credentials: 'include' })
                        .then(function(r) { return r.text(); })
                        .then(send)
                        .catch(function() {});
                }
            } catch (e) {}
            return origWindowOpen.apply(window, arguments);
        };
    }
})();

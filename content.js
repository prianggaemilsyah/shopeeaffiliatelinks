(function() {
    'use strict';

    if (document.getElementById('shopee-extractor-panel')) return;

    function sleep(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    function pickCol(row, names, exclude) {
        var keys = Object.keys(row);
        var i, k, key, name;
        for (i = 0; i < names.length; i++) {
            name = names[i].toLowerCase();
            for (k = 0; k < keys.length; k++) {
                if (keys[k].toLowerCase() === name) return row[keys[k]];
            }
        }
        for (i = 0; i < names.length; i++) {
            name = names[i].toLowerCase();
            for (k = 0; k < keys.length; k++) {
                key = keys[k].toLowerCase();
                if (exclude && exclude.some(function(e) { return key.indexOf(e.toLowerCase()) !== -1; })) continue;
                if (key.indexOf(name) !== -1) return row[keys[k]];
            }
        }
        return '';
    }

    function cleanCell(v) {
        if (v == null) return '';
        v = String(v).trim();
        if (v.length >= 2 && v.charAt(0) === '"' && v.charAt(v.length - 1) === '"') {
            v = v.substring(1, v.length - 1).replace(/""/g, '"');
        }
        return v.trim();
    }

    function detectDelimiter(text) {
        var end = text.length;
        var inQ = false;
        for (var i = 0; i < text.length; i++) {
            var c = text.charAt(i);
            if (c === '"') inQ = !inQ;
            else if ((c === '\n' || c === '\r') && !inQ) { end = i; break; }
        }
        var line = text.substring(0, end);
        var cands = ['\t', ';', ','];
        var best = '\t';
        var bestCount = -1;
        for (var k = 0; k < cands.length; k++) {
            var count = 0;
            var q = false;
            for (var j = 0; j < line.length; j++) {
                var ch = line.charAt(j);
                if (ch === '"') q = !q;
                else if (ch === cands[k] && !q) count++;
            }
            if (count > bestCount) { bestCount = count; best = cands[k]; }
        }
        return best;
    }

    // Parser CSV yang menghormati tanda kutip (field bisa berisi koma/newline).
    function parseDelimited(text, delim) {
        var rows = [];
        var row = [];
        var field = '';
        var inQuotes = false;
        var i = 0;
        var len = text.length;
        while (i < len) {
            var ch = text.charAt(i);
            if (inQuotes) {
                if (ch === '"') {
                    if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
                    inQuotes = false; i++; continue;
                }
                field += ch; i++; continue;
            }
            if (ch === '"') { inQuotes = true; i++; continue; }
            if (ch === delim) { row.push(field); field = ''; i++; continue; }
            if (ch === '\r') { i++; continue; }
            if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
            field += ch; i++;
        }
        if (field.length > 0 || row.length > 0) {
            row.push(field);
            rows.push(row);
        }
        if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0].trim() === '') {
            rows.pop();
        }
        return rows;
    }

    function parseCSV(text) {
        text = text.replace(/^\uFEFF/, '');
        var delim = detectDelimiter(text);
        var rows = parseDelimited(text, delim);
        if (rows.length < 2) return [];

        var headers = rows[0].map(cleanCell);
        var results = [];
        for (var i = 1; i < rows.length; i++) {
            var cols = rows[i];
            if (cols.length === 1 && cols[0].trim() === '') continue;
            var row = {};
            for (var j = 0; j < headers.length; j++) {
                row[headers[j]] = cleanCell(cols[j]);
            }
            results.push(row);
        }
        return results;
    }

    function clickAllCheckboxes() {
        var checkboxes = document.querySelectorAll('.product-offer-item .ant-checkbox-input');
        checkboxes.forEach(function(cb) {
            if (!cb.checked) {
                cb.click();
            }
        });
        return checkboxes.length;
    }

    // CSV dikirim oleh inject.js (MAIN world) lewat postMessage karena override
    // window.fetch / URL.createObjectURL di isolated world tidak mengenai halaman.
    var pendingCSV = null;
    window.addEventListener('message', function(e) {
        var d = e.data;
        if (d && d.__shopeeExtractorCSV === true && typeof d.text === 'string') {
            pendingCSV = d.text;
        }
    });

    function waitForCSVDownload(maxWait) {
        return new Promise(function(resolve) {
            pendingCSV = null;
            try { window.postMessage({ __shopeeExtractorArm: true }, '*'); } catch (e) {}

            var waited = 0;
            var check = setInterval(function() {
                waited += 300;
                if (pendingCSV || waited >= maxWait) {
                    clearInterval(check);
                    try { window.postMessage({ __shopeeExtractorDisarm: true }, '*'); } catch (e) {}
                    resolve(pendingCSV);
                }
            }, 300);
        });
    }

    function extractProductsFromDOM() {
        var products = [];
        var items = document.querySelectorAll('.product-offer-item');
        items.forEach(function(item) {
            var imgEl = item.querySelector('.ItemCard__image img');
            var nameEl = item.querySelector('.ItemCard__name');
            var priceEl = item.querySelector('.price');
            var soldEl = item.querySelector('.ItemCardSold__wrap span');
            var commEl = item.querySelector('.commRate');
            var linkEl = item.querySelector('a[href*="product_offer/"]');

            var imgUrl = imgEl ? (imgEl.src || imgEl.dataset.src || '') : '';
            var name = nameEl ? nameEl.textContent.trim() : '';
            var price = priceEl ? priceEl.textContent.trim() : '';
            var sold = soldEl ? soldEl.textContent.trim() : '';
            var komisi = commEl ? commEl.textContent.trim() : '';
            var href = linkEl ? linkEl.getAttribute('href') : '';

            var productId = '';
            var shopId = '';
            var m = href.match(/product_offer\/(\d+)/);
            if (m) productId = m[1];

            products.push({
                product_id: productId,
                nama_produk: name,
                harga: price,
                penjualan: sold,
                komisi: komisi,
                images: imgUrl ? [imgUrl] : [],
                link_produk: '',
                link_komisi: ''
            });
        });
        return products;
    }

    function clickNextPage() {
        var wrap = document.querySelector('.PaginationNoTotal__wrap');
        if (wrap) {
            var next = wrap.querySelector('.page-item.page-next');
            if (next && !next.classList.contains('disabled')) { next.click(); return true; }

            var active = wrap.querySelector('.page-item.page-page.active');
            var current = active ? (parseInt(active.textContent.trim(), 10) || 1) : 1;
            var pages = wrap.querySelectorAll('.page-item.page-page');
            for (var i = 0; i < pages.length; i++) {
                if ((parseInt(pages[i].textContent.trim(), 10) || 0) === current + 1) {
                    pages[i].click();
                    return true;
                }
            }
            var more = wrap.querySelector('.page-item.page-more');
            if (more) { more.click(); return true; }
        }
        var nextBtn = document.querySelector('[type="arrow-right"]:not(.page-prev):not(.disabled)')
            || document.querySelector('span[style*="arrow-right"]:not(.page-prev):not(.disabled)');
        if (nextBtn) { nextBtn.click(); return true; }
        return false;
    }

    function waitForPageChange(oldFirstId, maxWait) {
        return new Promise(function(resolve) {
            var waited = 0;
            var interval = setInterval(function() {
                var items = document.querySelectorAll('.product-offer-item');
                var newFirst = items[0];
                if (!newFirst) { waited += 200; return; }
                var newFirstId = '';
                var link = newFirst.querySelector('a[href*="product_offer/"]');
                if (link) {
                    var m2 = link.getAttribute('href').match(/product_offer\/(\d+)/);
                    if (m2) newFirstId = m2[1];
                }
                if (newFirstId && newFirstId !== oldFirstId) {
                    clearInterval(interval);
                    resolve(true);
                }
                waited += 200;
                if (waited >= maxWait) { clearInterval(interval); resolve(false); }
            }, 200);
        });
    }

    // ===== FLOATING PANEL =====
    var panel = document.createElement('div');
    panel.id = 'shopee-extractor-panel';
    panel.innerHTML = ''
        + '<div style="font-weight:bold;font-size:14px;margin-bottom:8px;">Shopee Affiliate Extractor</div>'
        + '<div style="margin-bottom:6px;">'
        + '<label style="font-size:12px;">Target produk: </label>'
        + '<input id="se-target" type="number" value="40" min="1" max="5000" style="width:60px;padding:2px 4px;border:1px solid #ccc;border-radius:3px;font-size:12px;">'
        + '</div>'
        + '<div id="se-status" style="color:#888;font-size:11px;margin-bottom:6px;min-height:16px;">Siap</div>'
        + '<div id="se-progress" style="width:100%;height:4px;background:#eee;border-radius:2px;margin-bottom:8px;display:none;">'
        + '<div id="se-bar" style="height:100%;background:#4CAF50;border-radius:2px;width:0%;transition:width 0.3s;"></div>'
        + '</div>'
        + '<div style="display:flex;gap:6px;">'
        + '<button id="se-start" style="padding:4px 12px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">Start</button>'
        + '<button id="se-stop" style="padding:4px 12px;background:#f44336;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;display:none;">Stop</button>'
        + '</div>'
        + '<div style="margin-top:6px;font-size:10px;color:#aaa;">Drag untuk geser</div>';

    panel.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999999;background:white;padding:14px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:Arial,sans-serif;font-size:13px;color:#333;min-width:260px;user-select:none;';
    document.body.appendChild(panel);

    var isDragging = false, dragX, dragY;
    panel.addEventListener('mousedown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
        isDragging = true;
        dragX = e.clientX - panel.getBoundingClientRect().left;
        dragY = e.clientY - panel.getBoundingClientRect().top;
        panel.style.transition = 'none';
    });
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        panel.style.right = 'auto';
        panel.style.left = (e.clientX - dragX) + 'px';
        panel.style.top = (e.clientY - dragY) + 'px';
    });
    document.addEventListener('mouseup', function() { isDragging = false; });

    var statusEl = document.getElementById('se-status');
    var startBtn = document.getElementById('se-start');
    var stopBtn = document.getElementById('se-stop');
    var targetInput = document.getElementById('se-target');
    var progressEl = document.getElementById('se-progress');
    var barEl = document.getElementById('se-bar');
    var stopped = false;

    function setStatus(msg) { statusEl.textContent = msg; }
    function setProgress(pct) { barEl.style.width = pct + '%'; }

    function hasNextPage() {
        var next = document.querySelector('.PaginationNoTotal__wrap .page-item.page-next');
        if (next) return !next.classList.contains('disabled');
        var arrowRight = document.querySelector('[type="arrow-right"]:not(.page-prev):not(.disabled)');
        return !!arrowRight;
    }

    async function clickBuatLinkMassal() {
        setStatus('Cari tombol "Buat Link Massal"...');
        await sleep(500);

        var bulkBtn = null;
        var allBtns = document.querySelectorAll('button');
        for (var b = 0; b < allBtns.length; b++) {
            if (allBtns[b].textContent.trim().includes('Buat Link Massal')) {
                bulkBtn = allBtns[b];
                break;
            }
        }

        if (!bulkBtn) {
            setStatus('Tombol "Buat Link Massal" tidak ditemukan');
            return null;
        }

        var csvPromise = waitForCSVDownload(20000);
        bulkBtn.click();
        setStatus('Klik "Buat Link Massal" | Menunggu popup...');

        // Poll sampai tombol "Buat Link" di popup muncul
        var popupBtn = null;
        for (var w = 0; w < 40 && !popupBtn; w++) {
            await sleep(200);
            popupBtn = findBuatLinkButton();
        }

        if (popupBtn) {
            setStatus('Klik "Buat Link" di popup...');
            popupBtn.click();
            await sleep(1000);
        } else {
            setStatus('Popup "Buat Link" tidak ditemukan, tunggu CSV...');
        }

        var csvText = await csvPromise;
        return csvText;
    }

    function findBuatLinkButton() {
        // Cari di modal/popup yang visible
        var modals = document.querySelectorAll('.ant-modal-wrap, .ant-modal, [role="dialog"], .ant-popover');
        for (var mo = 0; mo < modals.length; mo++) {
            var st = window.getComputedStyle(modals[mo]);
            if (st.display === 'none' || st.visibility === 'hidden') continue;
            var btnsInModal = modals[mo].querySelectorAll('button');
            for (var mb = 0; mb < btnsInModal.length; mb++) {
                if (btnsInModal[mb].textContent.trim() === 'Buat Link') {
                    return btnsInModal[mb];
                }
            }
        }

        // Fallback: button.mkt-btn dengan text "Buat Link"
        var mkt = document.querySelector('button.mkt-btn');
        if (mkt && mkt.textContent.trim() === 'Buat Link') return mkt;

        // Fallback: semua button visible dengan text "Buat Link"
        var allBtns = document.querySelectorAll('button');
        for (var b = 0; b < allBtns.length; b++) {
            var btn = allBtns[b];
            if (btn.textContent.trim() !== 'Buat Link') continue;
            var rect = btn.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && btn.offsetParent !== null) return btn;
        }
        return null;
    }

    async function run() {
        var target = parseInt(targetInput.value) || 20;
        stopped = false;
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        progressEl.style.display = 'block';
        setStatus('Mulai...');

        var allProducts = {};
        var allCSVData = {};
        var page = 1;

        // Phase 1: Loop semua halaman, centang checkbox, extract gambar dari DOM
        while (!stopped && Object.keys(allProducts).length < target) {
            var total = Object.keys(allProducts).length;
            setProgress(Math.min(100, Math.round(total / target * 100)));
            setStatus('Halaman ' + page + ' | Centang checkbox...');

            var checked = clickAllCheckboxes();
            await sleep(500);

            // Extract gambar dari DOM
            var pageProducts = extractProductsFromDOM();
            var addedThisPage = 0;
            for (var i = 0; i < pageProducts.length; i++) {
                var p = pageProducts[i];
                if (!allProducts[p.product_id]) {
                    allProducts[p.product_id] = p;
                    addedThisPage++;
                    if (Object.keys(allProducts).length >= target) break;
                }
            }

            total = Object.keys(allProducts).length;
            setProgress(Math.min(100, Math.round(total / target * 100)));
            setStatus('Halaman ' + page + ' | ' + total + '/' + target + ' (+' + addedThisPage + ') | checkbox: ' + checked);

            // Cek apakah sudah cukup atau halaman terakhir
            var reachedTarget = Object.keys(allProducts).length >= target;
            var isLastPage = !hasNextPage();

            if (reachedTarget || isLastPage) {
                setStatus('Halaman terakhir | Klik "Buat Link Massal"...');
                break;
            }

            var firstId = '';
            if (pageProducts.length > 0) firstId = pageProducts[0].product_id;

            var clicked = clickNextPage();
            if (!clicked) {
                setStatus('Tidak ada tombol next.');
                break;
            }

            setStatus('Loading halaman ' + (page + 1) + '...');
            var changed = await waitForPageChange(firstId, 10000);
            if (!changed) {
                setStatus('Halaman tidak berubah.');
                break;
            }

            await sleep(2000);
            page++;
            if (page > 200) { setStatus('Safety limit'); break; }
        }

        // Phase 2: Di halaman terakhir, klik "Buat Link Massal" untuk generate affiliate links
        if (!stopped) {
            // Centang ulang semua checkbox di halaman ini
            clickAllCheckboxes();
            await sleep(500);

            var csvText = await clickBuatLinkMassal();

            if (csvText) {
                var rows = parseCSV(csvText);
                rows.forEach(function(row) {
                    var pid = pickCol(row, ['ID Produk', 'Product ID', 'ProductId', 'ID']);
                    if (pid) {
                        allCSVData[pid] = {
                            link_produk: pickCol(row, ['Link Produk', 'Product Link', 'Link Product']),
                            link_komisi: pickCol(row, ['Link Komisi Ekstra', 'Link Komisi', 'Link Afiliasi', 'Affiliate Link', 'Link Affiliate']),
                            nama_toko: pickCol(row, ['Nama Toko', 'Shop Name', 'Nama Shop']),
                            komisi_rate: pickCol(row, ['Komisi hingga', 'Komisi Rate', 'Rate Komisi']),
                            komisi_rp: pickCol(row, ['Komisi'], ['hingga', 'rate', '%', 'ekstra'])
                        };
                    }
                });
                setStatus('CSV: ' + rows.length + ' produk dengan Link Komisi');
            } else {
                setStatus('CSV tidak tertangkap');
            }
        }

        // Phase 3: Merge data CSV ke products
        Object.keys(allProducts).forEach(function(pid) {
            var p = allProducts[pid];
            var csvData = allCSVData[pid];
            if (csvData) {
                p.link_produk = csvData.link_produk;
                p.link_komisi = csvData.link_komisi;
                p.nama_toko = csvData.nama_toko;
                p.komisi = csvData.komisi_rate + ' (' + csvData.komisi_rp + ')';
            }
        });

        // Phase 4: Download JSON
        var finalCount = Object.keys(allProducts).length;
        setProgress(100);

        if (finalCount > 0) {
            var arr = Object.values(allProducts);
            var withLink = arr.filter(function(p) { return p.link_komisi; }).length;
            var output = {
                extracted_at: new Date().toISOString(),
                total_products: arr.length,
                with_affiliate_link: withLink,
                pages_scraped: page,
                products: arr
            };

            var blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'shopee_products.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setStatus('Done! ' + arr.length + ' produk (' + withLink + ' punya Link Komisi).');
        } else {
            setStatus('Tidak ada produk ditemukan.');
        }

        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
    }

    startBtn.addEventListener('click', run);
    stopBtn.addEventListener('click', function() {
        stopped = true;
        setStatus('Dihentikan...');
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
    });

})();

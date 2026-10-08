(function() {
    'use strict';

    if (document.getElementById('shopee-extractor-panel')) return;

    function sleep(ms) {
        return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    function parseCSV(text) {
        var lines = text.trim().split('\n');
        if (lines.length < 2) return [];
        var headers = lines[0].split('\t');
        var results = [];
        for (var i = 1; i < lines.length; i++) {
            var cols = lines[i].split('\t');
            if (cols.length < 2) continue;
            var row = {};
            for (var j = 0; j < headers.length; j++) {
                row[headers[j].trim()] = (cols[j] || '').trim();
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

    function waitForDownload(maxWait) {
        return new Promise(function(resolve) {
            var origCreateObjectURL = URL.createObjectURL;
            var origClick = HTMLAnchorElement.prototype.click;
            var captured = null;

            URL.createObjectURL = function(blob) {
                var url = origCreateObjectURL.call(URL, blob);
                if (blob && blob.type && (blob.type.includes('csv') || blob.type.includes('text') || blob.type.includes('octet'))) {
                    var reader = new FileReader();
                    reader.onload = function() { captured = reader.result; };
                    reader.readAsText(blob);
                }
                return url;
            };

            HTMLAnchorElement.prototype.click = function() {
                if (this.download && !captured) {
                    // Intercept download - don't actually download
                }
                return origClick.call(this);
            };

            var waited = 0;
            var check = setInterval(function() {
                waited += 300;
                if (captured || waited >= maxWait) {
                    clearInterval(check);
                    URL.createObjectURL = origCreateObjectURL;
                    HTMLAnchorElement.prototype.click = origClick;
                    resolve(captured);
                }
            }, 300);
        });
    }

    function waitForCSVDownload(maxWait) {
        return new Promise(function(resolve) {
            var captured = null;
            var origFetch = window.fetch;

            window.fetch = function() {
                return origFetch.apply(this, arguments).then(function(response) {
                    var url = response.url || '';
                    if (!captured && (url.includes('link') || url.includes('csv') || url.includes('export') || url.includes('share'))) {
                        response.clone().text().then(function(t) {
                            if (t.includes('\t') && t.includes('Link')) {
                                captured = t;
                            }
                        });
                    }
                    return response;
                });
            };

            var waited = 0;
            var check = setInterval(function() {
                waited += 300;
                if (captured || waited >= maxWait) {
                    clearInterval(check);
                    window.fetch = origFetch;
                    resolve(captured);
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
        var nextBtn = document.querySelector('[type="arrow-right"]')
            || document.querySelector('span[style*="arrow-right"]');
        if (nextBtn) { nextBtn.click(); return true; }
        var pages = document.querySelectorAll('.page-item');
        if (pages.length > 0) { pages[pages.length - 1].click(); return true; }
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
        var arrowRight = document.querySelector('[type="arrow-right"]');
        if (arrowRight) return true;
        var spans = document.querySelectorAll('span[style*="arrow-right"]');
        if (spans.length > 0) return true;
        return false;
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

        var csvPromise = waitForCSVDownload(15000);
        bulkBtn.click();
        setStatus('Klik "Buat Link Massal" | Menunggu popup...');

        await sleep(1500);

        // Cari tombol "Buat Link" di popup/modal
        var popupBtn = null;

        // Cari di modal/popup yang visible
        var modals = document.querySelectorAll('.ant-modal-wrap:not([style*="display: none"]), .ant-modal, [role="dialog"], .ant-popover:not(.ant-popover-hidden)');
        for (var mo = 0; mo < modals.length; mo++) {
            var btnsInModal = modals[mo].querySelectorAll('button');
            for (var mb = 0; mb < btnsInModal.length; mb++) {
                var txt = btnsInModal[mb].textContent.trim();
                if (txt === 'Buat Link' || txt.includes('Buat Link')) {
                    popupBtn = btnsInModal[mb];
                    break;
                }
            }
            if (popupBtn) break;
        }

        // Fallback: cari button.mkt-btn
        if (!popupBtn) {
            popupBtn = document.querySelector('button.mkt-btn');
        }

        // Fallback: cari semua button visible dengan text "Buat Link"
        if (!popupBtn) {
            var allBtns2 = document.querySelectorAll('button');
            for (var b2 = 0; b2 < allBtns2.length; b2++) {
                var btn = allBtns2[b2];
                var txt2 = btn.textContent.trim();
                var rect = btn.getBoundingClientRect();
                var visible = rect.width > 0 && rect.height > 0 && btn.offsetParent !== null;
                if (txt2 === 'Buat Link' && visible) {
                    popupBtn = btn;
                    break;
                }
            }
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
                    var pid = row['ID Produk'] || '';
                    if (pid) {
                        allCSVData[pid] = {
                            link_produk: row['Link Produk'] || '',
                            link_komisi: row['Link Komisi Ekstra'] || '',
                            nama_toko: row['Nama Toko'] || '',
                            komisi_rate: row['Komisi hingga'] || '',
                            komisi_rp: row['Komisi'] || ''
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

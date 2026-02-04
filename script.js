// Android SDK version mapping
const sdkVersions = {
    1:  '1.0',   2:  '1.1',   3:  '1.5',   4:  '1.6',   5:  '2.0',  6:  '2.0.1',
    7:  '2.1',   8:  '2.2',   9:  '2.3',   10: '2.3.3', 11: '3.0',  12: '3.1',
    13: '3.2',   14: '4.0',   15: '4.0.3', 16: '4.1',   17: '4.2',  18: '4.3',
    19: '4.4',   20: '4.4W',  21: '5.0',   22: '5.1',   23: '6.0',  24: '7.0',
    25: '7.1',   26: '8.0',   27: '8.1',   28: '9.0',   29: '10',   30: '11',
    31: '12',    32: '12.1',  33: '13',    34: '14',    35: '15',   36: '16'
}; // https://en.wikipedia.org/wiki/Android_version_history

// Utility functions
const getAndroidVersion = sdk => sdkVersions[sdk] ? `Android ${sdkVersions[sdk]}` : `API ${sdk}`;
const formatFileSize = bytes => {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
};
const formatDate = date => new Date(date).toLocaleDateString();
const roundToDecimal = (num, places = 2) => Math.round(num * 10**places) / 10**places;
const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const guessAndroidScreenDensity = () => {
    // Android density buckets (dpi): 160 mdpi, 240 hdpi, 320 xhdpi, 480 xxhdpi, 640 xxxhdpi.
    // Some RuStore apps return empty downloadUrls for low/zero densities, so we clamp to >= 240.
    const dpr = Number(window.devicePixelRatio || 1);
    let density;
    if (dpr >= 4) density = 640;
    else if (dpr >= 3) density = 480;
    else if (dpr >= 2) density = 320;
    else if (dpr >= 1.5) density = 240;
    else density = 160;
    return Math.max(240, density);
};

const basenameFromUrl = (url) => {
    try {
        const u = new URL(url);
        const name = u.pathname.split('/').filter(Boolean).pop() || 'file.apk';
        return name;
    } catch {
        return 'file.apk';
    }
};

const createRatingStars = rating => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    return Array.from({length: 5}, (_, i) => 
        i < fullStars 
            ? '<span class="rating-star">★</span>' 
            : (i === fullStars && hasHalfStar) 
                ? '<span class="rating-star">⯪</span>' 
                : '<span class="text-gray-300">★</span>'
    ).join('');
};

// Modal Management
const ModalManager = {
    show(modalId, contentId, content) {
        const modal = document.getElementById(modalId);
        if (contentId) {
            document.getElementById(contentId).innerHTML = content;
        }
        modal.classList.remove('hidden');
        modal.classList.add('show');
    },

    hide(modalId, contentId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('hidden');
        modal.classList.remove('show');
        if (contentId) {
            document.getElementById(contentId).innerHTML = '';
        }
    },

    showError(containerId, title, message) {
        document.getElementById(containerId).innerHTML = `
            <div class="col-span-full text-center p-4 bg-red-50 rounded-lg">
                <p class="text-red-600 font-medium">${title}</p>
                <p class="text-red-500 text-sm mt-2">${message}</p>
            </div>
        `;
    }
};

// State Management
const state = {
    controller: null,
    imageIndex: 0,
    images: [],
    page: 0,
    isLoading: false,
    hasMorePages: true,
    query: '',
    
    reset() {
        if (this.controller) this.controller.abort();
        this.controller = new AbortController();
        this.page = 0;
        this.hasMorePages = true;
    }
};

// API functions
async function searchApps(query, isLoadMore = false) {
    if (!isLoadMore) {
        state.reset();
        state.query = query;
        state.isLoading = false;  // Reset loading state for new search
    }

    if (!query.trim() || state.isLoading || !state.hasMorePages) return;

    const resultsContainer = document.getElementById('searchResults');
    if (!isLoadMore) {
        resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">Searching...</p></div>';
    }
    
    state.isLoading = true;

    try {
        const response = await fetch(`https://backapi.rustore.ru/applicationData/apps?pageNumber=${state.page}&pageSize=20&query=${encodeURIComponent(query.trim())}`, {
            signal: state.controller.signal
        });
        const data = await response.json();
        
        // Check if this is still the current query
        if (query !== state.query) {
            return;
        }
        
        if (data.code === 'OK') {
            const results = data.body.content;
            
            if (!isLoadMore) resultsContainer.innerHTML = '';
            
            if (results.length === 0) {
                if (!isLoadMore) {
                    resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">No apps found</p></div>';
                }
                state.hasMorePages = false;
                return;
            }
            
            for (const app of results) {
                // Check if query has changed before processing each app
                if (query !== state.query) {
                    return;
                }
                const appDetails = await fetchAppDetails(app.packageName, { signal: state.controller.signal });
                if (appDetails) resultsContainer.appendChild(createAppCard(appDetails, app));
            }

            state.hasMorePages = state.page < data.body.totalPages - 1;
            state.page++;
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error searching apps:', error);
            if (!isLoadMore && query === state.query) {
                ModalManager.showError('searchResults', 'Unable to connect to the server', 'Please check your internet connection and try again');
            }
        }
    } finally {
        if (query === state.query) {
            state.isLoading = false;
        }
    }
}

async function fetchAppDetails(packageName, { signal } = {}) {
    try {
        const response = await fetch(`https://backapi.rustore.ru/applicationData/overallInfo/${packageName}`, { signal });
        const data = await response.json();
        return data.code === 'OK' ? data.body : null;
    } catch (error) {
        if (error.name !== 'AbortError') console.error('Error fetching app details:', error);
        return null;
    }
}

// UI functions
function createAppCard(appDetails, app) {
    const screenshots = appDetails.fileUrls.sort((a, b) => a.ordinal - b.ordinal);
    
    // Escape special characters in the description
    const escapedDescription = appDetails.fullDescription
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    
    return Object.assign(document.createElement('div'), {
        className: 'app-card p-4 flex flex-col justify-between h-full',
        innerHTML: `
            <div class="flex items-start gap-4">
                <img src="${appDetails.iconUrl}" alt="${appDetails.appName}" class="w-20 h-20 rounded-lg">
                <div class="flex-1 flex flex-col min-w-0">
                    <h2 class="text-xl font-bold break-words whitespace-normal w-full">${appDetails.appName}</h2>
                    <p class="text-gray-600 break-words whitespace-normal max-w-full" title="${appDetails.packageName}">${appDetails.packageName}</p>
                    <div class="rating mt-2">
                        ${createRatingStars(app.averageUserRating)}
                        ${roundToDecimal(app.averageUserRating)}
                        <span class="text-sm text-gray-600">(${app.totalRatings.toLocaleString()})</span>
                    </div>
                    <button class="comments-toggle" onclick="showComments('${appDetails.packageName}', 0, true)">Show comments</button>
                </div>
            </div>
            
            <div class="mt-4">
                <p class="text-gray-700">${appDetails.shortDescription}</p>
                <button class="description-toggle mt-2" onclick="showDescription('${appDetails.appName}', '${escapedDescription}')">Show full description</button>
            </div>
            
            <div class="screenshots-container my-4">
                ${screenshots.map(s => `<img src="${s.fileUrl}" alt="Screenshot" class="w-40 cursor-pointer rounded shadow" onclick="openPreview('${s.fileUrl}', event)">`).join('')}
            </div>
            
            <div class="grid grid-cols-2 gap-2 text-sm text-gray-600">
                <div>App ID: ${appDetails.appId}</div>
                <div>Version Code: ${appDetails.versionCode}</div>
                <div>Size: ~${formatFileSize(appDetails.fileSize)}</div>
                <div>Min SDK: ${getAndroidVersion(appDetails.minSdkVersion)}</div>
                <div>Version: ${appDetails.versionName}</div>
                <div>Downloads: ${appDetails.downloads.toLocaleString()}</div>
                <div>Updated: ${formatDate(appDetails.appVerUpdatedAt)}</div>
                <div>Added: ${ appDetails.appVerUpdatedAt > appDetails.firstPublishedAt 
                    ? formatDate(appDetails.firstPublishedAt)
                    : formatDate(appDetails.appVerUpdatedAt) }</div>
            </div>
            
            <div class="mt-4 flex justify-between items-center">
                <button class="download-btn" onclick="downloadApp(${appDetails.appId}, ${appDetails.minSdkVersion})">Download</button>
                <span class="version-history-btn" onclick="showVersionHistory(${appDetails.appId})">Version History</span>
            </div>
        `
    });
}

async function showVersionHistory(appId) {
    ModalManager.show('versionModal', 'versionHistory', '<div class="text-center p-4"><p class="text-gray-600">Loading version history...</p></div>');
    
    try {
        const response = await fetch(`https://backapi.rustore.ru/applicationData/allAppVersionWhatsNew/${appId}`);
        const data = await response.json();
        
        if (data.code === 'OK') {
            const versions = data.body.content;
            document.getElementById('versionHistory').innerHTML = versions.length ? 
                versions.map(v => `
                    <div class="border-b pb-4">
                        <div class="font-bold">Version ${v.versionName}</div>
                        <div class="text-sm text-gray-600">${formatDate(v.appVerUpdatedAt)}</div>
                        <div class="mt-2">${v.whatsNew}</div>
                    </div>
                `).join('') : 
                '<div class="text-center p-4"><p class="text-gray-600">No version history available</p></div>';
        }
    } catch (error) {
        console.error('Error fetching version history:', error);
        ModalManager.showError('versionHistory', 'Unable to load version history', 'Please try again later');
    }
}

async function downloadApp(appId, sdkVersion, options = {}) {
    ModalManager.show('downloadModal', 'downloadResults', '<div class="text-center p-4"><p class="text-gray-600">Obtaining download link...</p></div>');

    const openDownload = (url) => {
        // Use a user-initiated click handler to open/download reliably without navigating away.
        const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
        if (!newWindow) {
            // Pop-up blocked: fall back to same-tab navigation.
            window.location.href = url;
        }
    };

    const requestDownloadLink = async (withoutSplits, screenDensity) => {
        const response = await fetch('https://backapi.rustore.ru/applicationData/v2/download-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                appId,
                firstInstall: true,
                mobileServices: [],
                supportedAbis: [
                    'x86_64',
                    'arm64-v8a',
                    'x86',
                    'armeabi-v7a',
                    'armeabi'
                ],
                screenDensity,
                supportedLocales: ['ru_RU'],
                sdkVersion,
                withoutSplits,
                signatureFingerprint: null
            })
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errBody.message || 'Unknown error'}`);
        }
        return response.json();
    };

    const renderDownloadLinks = (data, { screenDensity, withoutSplitsUsed }) => {
        const container = document.getElementById('downloadResults');
        const urls = data?.body?.downloadUrls || [];
        const signature = data?.body?.signature || '';

        const allLinks = urls.map(u => u.url).filter(Boolean);
        const firstLink = allLinks[0];
        const isSplitSet = allLinks.length > 1;

        const buildDownloadPlan = () => {
            const versionCode = data?.body?.versionCode ?? 'unknown';
            const items = urls
                .map((u, idx) => ({
                    idx,
                    url: u?.url,
                    size: typeof u?.size === 'number' ? u.size : null,
                    hash: u?.hash ? String(u.hash) : null
                }))
                .filter(i => !!i.url);

            const sortedBySize = [...items].sort((a, b) => (b.size || 0) - (a.size || 0));
            const baseIdx = sortedBySize[0]?.idx;
            let configCounter = 1;

            return items.map(i => {
                const safeHash = (i.hash || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
                if (i.idx === baseIdx) {
                    return {
                        ...i,
                        role: 'base',
                        filename: `rustore_${appId}_${versionCode}_base${safeHash ? '_' + safeHash : ''}.apk`
                    };
                }
                const n = configCounter++;
                return {
                    ...i,
                    role: 'config',
                    filename: `rustore_${appId}_${versionCode}_config${n}${safeHash ? '_' + safeHash : ''}.apk`
                };
            });
        };

        const plan = buildDownloadPlan();

        const copyLinksButton = allLinks.length
            ? `<button class="download-btn" id="copyDownloadLinks">Copy links</button>`
            : '';

        const copyPowerShellButton = allLinks.length
            ? `<button class="download-btn" id="copyPwshScript">Copy PowerShell script</button>`
            : '';

        const copyCurlButton = allLinks.length
            ? `<button class="download-btn" id="copyCurlCommands">Copy curl commands</button>`
            : '';

        const copyAdbButton = isSplitSet
            ? `<button class="download-btn" id="copyAdbInstall">Copy adb install command</button>`
            : '';

        const densityOptions = [160, 240, 320, 480, 640, 0];
        const densitySelect = `
            <label class="text-sm text-gray-700">Screen density</label>
            <select id="screenDensitySelect" class="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg px-2 py-1 ml-2">
                ${densityOptions.map(d => `<option value="${d}" ${Number(d) === Number(screenDensity) ? 'selected' : ''}>${d === 0 ? '0 (auto/unknown)' : d}</option>`).join('')}
            </select>
            <button class="download-btn ml-2" id="retryDownload">Retry</button>
        `;

        container.innerHTML = `
            <div class="space-y-3">
                <div class="p-3 bg-gray-50 rounded-lg">
                    <div class="text-sm text-gray-700">
                        <div><span class="font-semibold">Used profile:</span> screenDensity=${escapeHtml(screenDensity)} • withoutSplits=${escapeHtml(withoutSplitsUsed)}</div>
                        ${isSplitSet ? '<div class="mt-1 text-sm text-gray-600">This app is delivered as a split APK set (multiple APK files). Download all parts to install.</div>' : ''}
                    </div>
                    <div class="mt-2">${densitySelect}</div>
                </div>

                <div class="text-sm text-gray-700">
                    <div><span class="font-semibold">App ID:</span> ${escapeHtml(data?.body?.appId)}</div>
                    <div><span class="font-semibold">Version Code:</span> ${escapeHtml(data?.body?.versionCode)}</div>
                    <div><span class="font-semibold">Version ID:</span> ${escapeHtml(data?.body?.versionId)}</div>
                    ${signature ? `<div class="break-all"><span class="font-semibold">Signature:</span> ${escapeHtml(signature)}</div>` : ''}
                </div>

                ${firstLink ? `
                    <div class="p-3 bg-green-50 rounded-lg">
                        <div class="text-green-700 font-semibold mb-2">Direct download link</div>
                        <a href="${escapeHtml(firstLink)}" class="text-blue-600 underline break-all" rel="noopener noreferrer" target="_blank">${escapeHtml(firstLink)}</a>
                        <div class="mt-3 flex gap-2 flex-wrap">
                            <button class="download-btn" id="startPrimaryDownload">Start download</button>
                            ${copyLinksButton}
                            ${copyPowerShellButton}
                            ${copyCurlButton}
                            ${copyAdbButton}
                        </div>
                        <div class="text-xs text-gray-600 mt-2">If the browser blocks auto-download, use the link above.</div>
                    </div>
                ` : ''}

                ${urls.length ? `
                    <div class="border-t pt-3">
                        <div class="font-semibold text-gray-800 mb-2">Files</div>
                        <div class="space-y-2">
                            ${urls.map((u, idx) => {
                                const url = u?.url || '';
                                const size = typeof u?.size === 'number' ? formatFileSize(u.size) : '';
                                const hash = u?.hash ? String(u.hash) : '';
                                return `
                                    <div class="p-3 bg-gray-50 rounded-lg">
                                        <div class="text-sm text-gray-700 mb-1">#${idx + 1}${size ? ` • ${escapeHtml(size)}` : ''}${hash ? ` • hash: <span class=\"font-mono\">${escapeHtml(hash)}</span>` : ''}</div>
                                        <a href="${escapeHtml(url)}" class="text-blue-600 underline break-all" rel="noopener noreferrer" target="_blank">${escapeHtml(url)}</a>
                                        <div class="mt-2">
                                            <button class="download-btn" data-download-url="${escapeHtml(url)}">Download this file</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}

                ${isSplitSet ? `
                    <div class="border-t pt-3">
                        <div class="font-semibold text-gray-800 mb-2">How to install (split APK set)</div>
                        <div class="text-sm text-gray-700 space-y-2">
                            <div><span class="font-semibold">On Android:</span> install using a split-APK installer (e.g. SAI / APKMirror Installer) and select all downloaded APK files.</div>
                            <div><span class="font-semibold">On PC (ADB):</span> download all APK parts into one folder, then run <span class="font-mono">adb install-multiple</span> with all files.</div>
                            <div class="text-xs text-gray-600">Tip: base APK is usually the largest file. Order matters less when you pass all files at once.</div>
                        </div>
                    </div>
                ` : ''}

                <details class="border-t pt-3">
                    <summary class="cursor-pointer text-sm text-gray-600">Debug JSON</summary>
                    <pre class="mt-2 whitespace-pre-wrap text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-auto">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
                </details>
            </div>
        `;

        // Wire up actions
        if (firstLink) {
            const btn = document.getElementById('startPrimaryDownload');
            if (btn) {
                btn.onclick = () => {
                    openDownload(firstLink);
                };
            }
        }

        container.querySelectorAll('button[data-download-url]').forEach((button) => {
            button.onclick = () => {
                const url = button.getAttribute('data-download-url');
                if (url) openDownload(url);
            };
        });

        const copyBtn = document.getElementById('copyDownloadLinks');
        if (copyBtn) {
            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(allLinks.join('\n'));
                    copyBtn.textContent = 'Copied';
                    setTimeout(() => (copyBtn.textContent = 'Copy links'), 1200);
                } catch {
                    // Fallback: show prompt
                    window.prompt('Copy links:', allLinks.join('\n'));
                }
            };
        }

        const toClipboard = async (text, button) => {
            try {
                await navigator.clipboard.writeText(text);
                if (button) {
                    const old = button.textContent;
                    button.textContent = 'Copied';
                    setTimeout(() => (button.textContent = old), 1200);
                }
            } catch {
                window.prompt('Copy:', text);
            }
        };

        const pwshBtn = document.getElementById('copyPwshScript');
        if (pwshBtn) {
            pwshBtn.onclick = () => {
                const lines = [];
                lines.push('$ErrorActionPreference = "Stop"');
                lines.push('$outDir = Join-Path $PWD "downloads"');
                lines.push('New-Item -ItemType Directory -Force -Path $outDir | Out-Null');
                for (const item of plan) {
                    lines.push(`Invoke-WebRequest -Uri "${item.url}" -OutFile (Join-Path $outDir "${item.filename}")`);
                }
                lines.push('Write-Host "Done. Files saved to" $outDir');
                if (isSplitSet) {
                    lines.push('');
                    lines.push('# Install (requires adb in PATH and USB debugging enabled)');
                    lines.push('$apks = Get-ChildItem -Path $outDir -Filter "*.apk" | Sort-Object Length -Descending | Select-Object -ExpandProperty FullName');
                    lines.push('Write-Host "Running: adb install-multiple <all apks>"');
                    lines.push('adb install-multiple @apks');
                }
                toClipboard(lines.join('\n'), pwshBtn);
            };
        }

        const curlBtn = document.getElementById('copyCurlCommands');
        if (curlBtn) {
            curlBtn.onclick = () => {
                const lines = [];
                lines.push('mkdir -p downloads');
                for (const item of plan) {
                    lines.push(`curl -L "${item.url}" -o "downloads/${item.filename}"`);
                }
                if (isSplitSet) {
                    lines.push('');
                    lines.push('# Install (requires adb)');
                    lines.push('adb install-multiple downloads/*.apk');
                }
                toClipboard(lines.join('\n'), curlBtn);
            };
        }

        const adbBtn = document.getElementById('copyAdbInstall');
        if (adbBtn) {
            adbBtn.onclick = () => {
                const lines = [];
                lines.push('# PowerShell (Windows)');
                lines.push('$apks = Get-ChildItem -Path .\downloads -Filter "*.apk" | Sort-Object Length -Descending | Select-Object -ExpandProperty FullName');
                lines.push('adb install-multiple @apks');
                lines.push('');
                lines.push('# Bash (macOS/Linux)');
                lines.push('adb install-multiple downloads/*.apk');
                toClipboard(lines.join('\n'), adbBtn);
            };
        }

        const retryBtn = document.getElementById('retryDownload');
        if (retryBtn) {
            retryBtn.onclick = () => {
                const select = document.getElementById('screenDensitySelect');
                const density = select ? Number(select.value) : screenDensity;
                downloadApp(appId, sdkVersion, { screenDensity: density });
            };
        }
    };

    try {
        const requestedDensity = Number.isFinite(options.screenDensity)
            ? Number(options.screenDensity)
            : guessAndroidScreenDensity();

        // Practical fallback list. Some apps return empty downloadUrls for density 0/160.
        const densityCandidates = Array.from(new Set([
            requestedDensity,
            480,
            320,
            240,
            160,
            0
        ].map(Number)));

        const withoutSplitsCandidates = [false, true];
        let lastData = null;
        let lastMeta = { screenDensity: requestedDensity, withoutSplitsUsed: false };

        for (const density of densityCandidates) {
            for (const withoutSplits of withoutSplitsCandidates) {
                const data = await requestDownloadLink(withoutSplits, density);
                if (data?.code !== 'OK') {
                    throw new Error(data?.message || 'Server returned error');
                }
                lastData = data;
                lastMeta = { screenDensity: density, withoutSplitsUsed: withoutSplits };

                const urls = data?.body?.downloadUrls || [];
                if (Array.isArray(urls) && urls.length > 0) {
                    renderDownloadLinks(data, lastMeta);
                    return;
                }
            }
        }

        // If we get here, all attempts returned empty URL lists.
        document.getElementById('downloadResults').innerHTML = `
            <div class="p-4 bg-yellow-50 rounded-lg">
                <div class="font-semibold text-yellow-800">No download URLs returned</div>
                <div class="text-sm text-yellow-700 mt-2">RuStore API returned <span class="font-mono">OK</span>, but provided an empty URL list for all tried profiles (screenDensity / withoutSplits). This may be a store restriction for this app or an unsupported device profile.</div>
                <div class="text-sm text-yellow-700 mt-2">Tip: try setting screenDensity to 240/320/480 and retry.</div>
                <details class="mt-3">
                    <summary class="cursor-pointer text-sm text-yellow-800">Debug JSON</summary>
                    <pre class="mt-2 whitespace-pre-wrap text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-auto">${escapeHtml(JSON.stringify(lastData, null, 2))}</pre>
                </details>
            </div>
        `;
    } catch (error) {
        console.error('Error downloading app:', error);
        ModalManager.showError('downloadResults', 'Unable to obtain download URLs', error?.message ? String(error.message) : 'Please try again');
    }
}

function showDescription(appName, description) {
    const modal = document.getElementById('descriptionModal');
    const content = document.getElementById('descriptionContent');
    
    // Set the app name as the modal title
    modal.querySelector('h2').textContent = `${appName} - Description`;
    
    // Set the description content
    content.textContent = description;
    
    // Show the modal
    modal.classList.remove('hidden');
    modal.classList.add('show');
}

async function showComments(packageName, pageNumber, firstOpen) {
    if (firstOpen) {
        document.getElementById('appCommentsHeader').innerHTML = `App Comments`;
        document.getElementById('commentsFilterOption').classList.add('hidden');
        ModalManager.show('commentsModal');
    }

    if (pageNumber == 0) {
        document.getElementById('appCommentsBody').innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Loading comments...</p></div>';
    }

    try {
        const filterOption = document.getElementById('commentsFilterOption').value;
        const response = await fetch(`https://backapi.rustore.ru/comment/comment?packageName=${packageName}&sortBy=${filterOption}&pageNumber=${pageNumber}&pageSize=20`);
        const data = await response.json();
        
        if (data.code === 'OK') {
            const comments = data.body.content;
            const commentsView = comments.length || pageNumber > 0 ? 
                comments.map(c => {
                    const devAnswer = c.devResponse ? `
                        <div class="mt-4">Ответ разработчика</div>
                        <div class="text-sm text-gray-600">${formatDate(c.devResponseDate)}</div>
                        <div class="mt-2">${c.devResponse}</div>
                    `: "";

                    return `<div class="p-4 bg-gray-100 rounded-xl">
                                <div>${c.firstName}</div>
                                <div class="rating">
                                    ${createRatingStars(c.appRating)}
                                </div>
                                <div class="text-sm text-gray-600">${formatDate(c.commentDate)}</div>
                                <div class="mt-2">${c.commentText}</div>
                                <div class="mt-4"><span class="font-bold text-green-600">${c.likeCounter}</span> | <span class="font-bold text-red-600">${c.dislikeCounter}</span></div>
                                ${devAnswer}
                            </div>`;
                }).join('') : 
                '<div class="text-center p-4"><p class="text-gray-600">No comments available</p></div>';
            
            if (pageNumber > 0) {
                document.getElementById('appCommentsBody').innerHTML += commentsView;
            } else {
                document.getElementById('appCommentsBody').innerHTML = commentsView;
            }

            document.getElementById('commentsModal').dataset.pageCount = pageNumber;
            document.getElementById('commentsModal').dataset.allCommentsLoaded = comments.length < 20 ? true : false;
            document.getElementById('commentsModal').dataset.canLoad = 'true';

            if (firstOpen) {
                document.getElementById('commentsModal').dataset.packageName = packageName;

                if (comments.length > 0)
                {
                    const commOpts = document.getElementById('commentsFilterOption');
                    commOpts.innerHTML = `
                        <option value="NEW_FIRST" selected>New first</option>
                        <option value="USEFUL_FIRST" selected>Useful first</option>
                        <option value="POSITIVE_FIRST">Positive first</option>
                        <option value="NEGATIVE_FIRST">Negative first</option>
                    `;                
                    commOpts.classList.remove('hidden');
                }
            }
        }
    } catch (error) {
        console.error('Error fetching comments:', error);
        ModalManager.showError('appCommentsBody', 'Unable to load comments', 'Please try again later');
    }
}

document.getElementById('commentsModal').children[0].addEventListener("scroll", function() {
    const pageNumber = +document.getElementById('commentsModal').dataset.pageCount;
    const packageName = document.getElementById('commentsModal').dataset.packageName;
    const needLoadComments = document.getElementById('commentsModal').dataset.allCommentsLoaded === 'false';
    const canLoad = document.getElementById('commentsModal').dataset.canLoad === 'true';

    if (this.scrollTop >= this.scrollHeight * .6 && packageName && needLoadComments && canLoad) {
        document.getElementById('commentsModal').dataset.canLoad = 'false';
        document.getElementById('commentsModal').dataset.pageCount = pageNumber + 1;
        showComments(packageName, pageNumber + 1);
    }
})

document.getElementById('commentsFilterOption').onchange = function() {
    document.getElementById('commentsModal').dataset.pageCount = 0;

    const packageName = document.getElementById('commentsModal').dataset.packageName;
    showComments(packageName, 0);
}

// Image Preview functions
function openPreview(imageUrl, event) {
    const modal = document.getElementById('imagePreviewModal');
    const currentCard = event.target.closest('.app-card');
    const screenshots = Array.from(currentCard.querySelectorAll('.screenshots-container img'));
    
    state.images = screenshots.map(img => img.src);
    state.imageIndex = state.images.indexOf(imageUrl);
    
    document.getElementById('previewImage').src = imageUrl;
    modal.classList.remove('hidden');
    modal.classList.add('show');
    modal.focus();
    modal.setAttribute('tabindex', '0');
    
    updateNavigationButtons();
}

function updateNavigationButtons() {
    const prevButton = document.getElementById('prevImage');
    const nextButton = document.getElementById('nextImage');
    const progressIndicator = document.getElementById('imageProgress');
    
    prevButton.style.display = state.imageIndex > 0 ? 'block' : 'none';
    nextButton.style.display = state.imageIndex < state.images.length - 1 ? 'block' : 'none';
    progressIndicator.textContent = `${state.imageIndex + 1} / ${state.images.length}`;
}

function navigateImage(direction) {
    if (direction === 'prev' && state.imageIndex > 0) {
        state.imageIndex--;
    } else if (direction === 'next' && state.imageIndex < state.images.length - 1) {
        state.imageIndex++;
    }
    
    document.getElementById('previewImage').src = state.images[state.imageIndex];
    updateNavigationButtons();
}

function closeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    modal.classList.add('hidden');
    modal.classList.remove('show');
    modal.removeAttribute('tabindex');
    state.images = [];
    state.imageIndex = 0;
    document.getElementById('imageProgress').textContent = '';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const clearButton = document.getElementById('clearSearch');
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => searchApps(e.target.value), 500);
        
        // Show/hide clear button based on input value
        clearButton.classList.toggle('hidden', !e.target.value);
    });

    // Clear input and hide button when clicked
    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clearButton.classList.add('hidden');
        searchInput.focus();
        // Clear the search results immediately
        document.getElementById('searchResults').innerHTML = '';
        // Reset the state
        state.reset();
        state.query = '';
        state.isLoading = false;
    });
    
    // Modal event listeners
    document.querySelectorAll('.modal-close').forEach(closeBtn => {
        closeBtn.onclick = () => {
            const modal = closeBtn.closest('.modal');
            const contentId = modal.querySelector('[id]').id;
            if (modal.id === 'imagePreviewModal') {
                closeImagePreview();
            } else {
                ModalManager.hide(modal.id, contentId);
            }
        };
    });
    
    // Image navigation
    document.getElementById('prevImage').onclick = () => navigateImage('prev');
    document.getElementById('nextImage').onclick = () => navigateImage('next');
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('imagePreviewModal').classList.contains('hidden')) {
            if (['ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) {
                e.preventDefault();
                if (e.key === 'ArrowLeft') navigateImage('prev');
                else if (e.key === 'ArrowRight') navigateImage('next');
                else if (e.key === 'Escape') closeImagePreview();
            }
        }
    });
    
    // Modal backdrop clicks
    window.onclick = e => {
        if (e.target.classList.contains('modal')) {
            if (e.target.id === 'imagePreviewModal') {
                closeImagePreview();
            } else {
                const contentId = e.target.querySelector('[id]').id;
                ModalManager.hide(e.target.id, contentId);
            }
        }
    };

    // Infinite scroll
    window.addEventListener('scroll', () => {
        if (state.isLoading || !state.hasMorePages) return;
        const scrollPosition = window.innerHeight + window.scrollY;
        const pageHeight = document.documentElement.scrollHeight;
        if (scrollPosition >= pageHeight - 200) {
            searchApps(state.query, true);
        }
    });
});
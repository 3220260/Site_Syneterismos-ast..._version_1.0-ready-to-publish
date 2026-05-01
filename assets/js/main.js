/* =========================================
   1. CORE SETTINGS & TRACKING
   ========================================= */
const GA_MEASUREMENT_ID = 'G-ZXPYBSBLTX';
const CHATBOT_ORIGIN = 'https://chat-bot-flame-six.vercel.app';
const IMAGE_PREVIEW_MIN_ZOOM = 1;
const IMAGE_PREVIEW_MAX_ZOOM = 4;
const MIN_CARD_VIEW_SECONDS = 2;
const TRACKED_OFFERS = Object.freeze({
    mobileModal: 'Κινητή Τηλεφωνία',
    vodaModal: 'Vodafone CU',
    novaModal: 'NOVA Q',
    novaLinePhone: 'Σταθερό και Internet',
    novaEonModal: 'NOVA EON TV',
    healthModal: 'Προσφορά Υγείας',
    gprotasisModal: 'GProtasis',
});

let pageScrollY = 0;
let imagePreviewZoom = 1;
let imagePreviewPinchDistance = 0;
let imagePreviewPinchZoom = 1;
let imagePreviewDragging = false;
let imagePreviewDragStartX = 0;
let imagePreviewDragStartY = 0;
let imagePreviewDragScrollLeft = 0;
let imagePreviewDragScrollTop = 0;
const activeOfferViews = {};
const offerCardViewStarts = new Map();
const offerCardViewed = new Set();
let trackedOfferCards = [];

function loadAllTracking() {
    if (window.trackingLoaded) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
        window.dataLayer.push(arguments);
    };

    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    script.async = true;
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, { 'anonymize_ip': true });
    window.trackingLoaded = true;
}

function hasAnalyticsConsent() {
    return localStorage.getItem('cookieConsent') === 'accepted';
}

function trackEvent(category, action, label, params = {}) {
    if (hasAnalyticsConsent() && typeof window.gtag === 'function') {
        window.gtag('event', action, {
            event_category: category,
            event_label: label,
            ...params,
        });
    }
}

function getOfferName(modalId) {
    return TRACKED_OFFERS[modalId] || '';
}

function getOpenOfferContext() {
    const openOffer = Object.keys(TRACKED_OFFERS).find((modalId) => {
        const modal = document.getElementById(modalId);
        return modal && !modal.classList.contains('hidden');
    });

    return openOffer ? { offer_id: openOffer, offer_name: getOfferName(openOffer) } : {};
}

function getFileName(path) {
    return (path || '').split('/').pop() || path || 'unknown';
}

function startOfferView(modalId, options = {}) {
    const offerName = getOfferName(modalId);
    if (!offerName || activeOfferViews[modalId]) return;

    activeOfferViews[modalId] = Date.now();
    if (options.trackOpen !== false) {
        trackEvent('Offer Engagement', 'offer_open', offerName, {
            offer_id: modalId,
            offer_name: offerName,
        });
    }
}

function stopOfferView(modalId, options = {}) {
    const offerName = getOfferName(modalId);
    const startedAt = activeOfferViews[modalId];
    if (!offerName || !startedAt) return;

    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    delete activeOfferViews[modalId];

    trackEvent('Offer Engagement', 'offer_close', offerName, {
        offer_id: modalId,
        offer_name: offerName,
        engagement_time_sec: seconds,
        ...(options.beacon ? { transport_type: 'beacon' } : {}),
    });

    if (seconds > 0) {
        trackEvent('Offer Engagement', 'offer_time_spent', offerName, {
            offer_id: modalId,
            offer_name: offerName,
            engagement_time_sec: seconds,
            value: seconds,
            ...(options.beacon ? { transport_type: 'beacon' } : {}),
        });
    }
}

function stopAllOfferViews(options = {}) {
    Object.keys(activeOfferViews).forEach((modalId) => stopOfferView(modalId, options));
}

function resumeOpenOfferViews() {
    Object.keys(TRACKED_OFFERS).forEach((modalId) => {
        const modal = document.getElementById(modalId);
        if (modal && !modal.classList.contains('hidden')) startOfferView(modalId, { trackOpen: false });
    });
}

function getOfferCardContext(card) {
    const modalId = card?.dataset?.modalTarget;
    const offerName = getOfferName(modalId);
    return offerName ? { offer_id: modalId, offer_name: offerName } : null;
}

function startOfferCardView(card) {
    const context = getOfferCardContext(card);
    if (!context || offerCardViewStarts.has(card) || hasOpenBlockingLayer()) return;
    offerCardViewStarts.set(card, Date.now());
}

function stopOfferCardView(card, options = {}) {
    const context = getOfferCardContext(card);
    const startedAt = offerCardViewStarts.get(card);
    if (!context || !startedAt) return;

    offerCardViewStarts.delete(card);
    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    if (seconds < MIN_CARD_VIEW_SECONDS) return;

    if (!offerCardViewed.has(context.offer_id)) {
        offerCardViewed.add(context.offer_id);
        trackEvent('Offer Engagement', 'offer_card_view', context.offer_name, context);
    }

    trackEvent('Offer Engagement', 'offer_card_time_spent', context.offer_name, {
        ...context,
        engagement_time_sec: seconds,
        value: seconds,
        ...(options.beacon ? { transport_type: 'beacon' } : {}),
    });
}

function stopAllOfferCardViews(options = {}) {
    Array.from(offerCardViewStarts.keys()).forEach((card) => stopOfferCardView(card, options));
}

function isElementMostlyVisible(element) {
    const rect = element.getBoundingClientRect();
    const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
    const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    const visibleArea = Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
    const totalArea = Math.max(1, rect.width * rect.height);
    return visibleArea / totalArea >= 0.5;
}

function refreshVisibleOfferCards() {
    if (hasOpenBlockingLayer()) return;
    trackedOfferCards.forEach((card) => {
        if (isElementMostlyVisible(card)) startOfferCardView(card);
        else stopOfferCardView(card);
    });
}

function initializeOfferCardTracking() {
    trackedOfferCards = Array.from(document.querySelectorAll('#offers-grid [data-modal-target]'));
    if (!trackedOfferCards.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.intersectionRatio >= 0.5) startOfferCardView(entry.target);
            else stopOfferCardView(entry.target);
        });
    }, { threshold: [0, 0.5] });

    trackedOfferCards.forEach((card) => observer.observe(card));
    refreshVisibleOfferCards();
}

function trackLinkClick(link) {
    const href = link.getAttribute('href') || '';
    const context = getOpenOfferContext();

    if (href.startsWith('assets/docs/')) {
        const documentName = getFileName(href);
        trackEvent('Documents', 'pdf_download', documentName, {
            ...context,
            document_name: documentName,
        });
        return;
    }

    if (href.startsWith('tel:')) {
        trackEvent('Contact', 'contact_click', 'phone', {
            ...context,
            contact_type: 'phone',
        });
        return;
    }

    if (href.startsWith('mailto:')) {
        trackEvent('Contact', 'contact_click', 'email', {
            ...context,
            contact_type: 'email',
        });
        return;
    }

    if (href.includes('invite.viber.com')) {
        trackEvent('Community', 'viber_click', 'Viber Community', {
            destination: 'viber_community',
        });
    }
}

/* =========================================
   2. UI FUNCTIONS (MODALS, TOASTS, TABS)
   ========================================= */

// Ειδοποιήσεις (Toasts) - Απαραίτητο για την αντιγραφή IBAN
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = type === 'success'
        ? '<i class="fa-solid fa-circle-check text-green-400"></i>'
        : '<i class="fa-solid fa-circle-info text-blue-400"></i>';
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

function hasOpenBlockingLayer() {
    const sidebar = document.getElementById('sidebarMenu');
    const chat = document.getElementById('chatModal');
    const preview = document.getElementById('imagePreviewModal');

    return Boolean(
        document.querySelector('.modal-backdrop:not(.hidden)') ||
        (preview && !preview.classList.contains('hidden')) ||
        (chat && !chat.classList.contains('hidden')) ||
        (sidebar && !sidebar.classList.contains('-translate-x-full'))
    );
}

function lockPageScroll() {
    if (document.body.dataset.scrollLocked === 'true') return;
    pageScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.dataset.scrollLocked = 'true';
    document.body.classList.add('overflow-hidden');
    document.body.style.position = 'fixed';
    document.body.style.top = `-${pageScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
}

function unlockPageScrollIfIdle() {
    if (hasOpenBlockingLayer() || document.body.dataset.scrollLocked !== 'true') return;

    document.body.classList.remove('overflow-hidden', 'scroll-locked');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.removeAttribute('data-scroll-locked');
    window.scrollTo(0, pageScrollY);
}

function loadDeferredIframes(root) {
    root.querySelectorAll('iframe[data-src]').forEach((iframe) => {
        if (!iframe.getAttribute('src')) {
            iframe.setAttribute('src', iframe.dataset.src);
        }
    });
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function openModal(id, updateHistory = true) {
    const modal = document.getElementById(id);
    if (!modal) return;
    const wasHidden = modal.classList.contains('hidden');

    if (wasHidden) stopAllOfferCardViews();
    modal.classList.remove('hidden');
    loadDeferredIframes(modal);
    if (wasHidden) {
        lockPageScroll();
        startOfferView(id);
    }
    
    const helper = document.querySelector('.helper-container');
    if (helper) helper.style.display = 'none';
    
    if (updateHistory && window.location.hash !== `#${id}`) {
        history.pushState({modalId: id}, '', `#${id}`);
    }
}

function openModalFromHash() {
    const modalId = decodeURIComponent(window.location.hash.replace('#', ''));
    if (!modalId) return;

    const modal = document.getElementById(modalId);
    if (modal && modal.classList.contains('modal-backdrop')) {
        openModal(modalId, false);
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    const wasOpen = modal && !modal.classList.contains('hidden');
    if (modal) modal.classList.add('hidden');
    if (wasOpen) stopOfferView(id);
    if (id === 'imagePreviewModal') {
        stopImagePreviewDrag();
        resetImagePreviewZoom(false);
    }
    
    if (window.location.hash === `#${id}`) {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }

    if (wasOpen) {
        unlockPageScrollIfIdle();
        if (!hasOpenBlockingLayer()) requestAnimationFrame(refreshVisibleOfferCards);
    }

    if (!hasOpenBlockingLayer()) {
        const helper = document.querySelector('.helper-container');
        if (helper) helper.style.display = 'flex';
    }
}

function toggleSidebar() {
    const menu = document.getElementById('sidebarMenu');
    const overlay = document.getElementById('sidebarOverlay');
    if (!menu || !overlay) return;

    const isClosed = menu.classList.contains('-translate-x-full');
    if (isClosed) {
        lockPageScroll();
        overlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            overlay.classList.remove('opacity-0');
            menu.classList.remove('-translate-x-full');
        });
    } else {
        menu.classList.add('-translate-x-full');
        overlay.classList.add('opacity-0');
        unlockPageScrollIfIdle();
        setTimeout(() => { overlay.classList.add('hidden'); }, 300);
    }
}

function openImagePreview(imgName) {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImageTarget');
    if (!modal || !img) return;
    
    img.onload = () => {
        resetImagePreviewZoom(false);
        storeImagePreviewBaseWidth();
    };
    img.src = imgName;
    modal.classList.remove('hidden');
    lockPageScroll();
    trackEvent('Documents', 'document_preview_open', getFileName(imgName), {
        ...getOpenOfferContext(),
        document_name: getFileName(imgName),
    });
    resetImagePreviewZoom(false);
    requestAnimationFrame(storeImagePreviewBaseWidth);
}

function storeImagePreviewBaseWidth() {
    const img = document.getElementById('previewImageTarget');
    if (!img) return;

    img.style.width = '';
    img.style.maxWidth = 'min(94vw, 1100px)';
    img.style.maxHeight = '86dvh';

    requestAnimationFrame(() => {
        const width = img.getBoundingClientRect().width;
        if (width > 0) img.dataset.baseWidth = String(width);
    });
}

function updateImagePreviewZoom() {
    const img = document.getElementById('previewImageTarget');
    const viewport = document.getElementById('imagePreviewViewport');
    const label = document.getElementById('imagePreviewZoomLabel');
    if (!img) return;

    if (imagePreviewZoom <= IMAGE_PREVIEW_MIN_ZOOM) {
        img.style.width = '';
        img.style.maxWidth = 'min(94vw, 1100px)';
        img.style.maxHeight = '86dvh';
        img.style.cursor = 'zoom-in';
        if (viewport) viewport.classList.remove('is-zoomed', 'is-dragging');
    } else {
        const baseWidth = Number(img.dataset.baseWidth) || img.getBoundingClientRect().width || img.naturalWidth;
        img.style.width = `${baseWidth * imagePreviewZoom}px`;
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        img.style.cursor = 'grab';
        if (viewport) viewport.classList.add('is-zoomed');
    }

    if (label) label.textContent = `${Math.round(imagePreviewZoom * 100)}%`;
}

function zoomImagePreview(amount) {
    const viewport = document.getElementById('imagePreviewViewport');
    const wasAtMinimum = imagePreviewZoom <= IMAGE_PREVIEW_MIN_ZOOM;

    imagePreviewZoom = clamp(imagePreviewZoom + amount, IMAGE_PREVIEW_MIN_ZOOM, IMAGE_PREVIEW_MAX_ZOOM);
    updateImagePreviewZoom();

    if (viewport && wasAtMinimum && imagePreviewZoom > IMAGE_PREVIEW_MIN_ZOOM) {
        requestAnimationFrame(() => {
            viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
            viewport.scrollTop = 0;
        });
    }
}

function resetImagePreviewZoom(scrollToTop = true) {
    imagePreviewZoom = 1;
    updateImagePreviewZoom();

    if (scrollToTop) {
        const viewport = document.getElementById('imagePreviewViewport');
        if (viewport) viewport.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
}

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}

function handleImagePreviewWheel(event) {
    const modal = document.getElementById('imagePreviewModal');
    if (!modal || modal.classList.contains('hidden')) return;

    event.preventDefault();
    zoomImagePreview(event.deltaY < 0 ? 0.25 : -0.25);
}

function handleImagePreviewTouchStart(event) {
    if (event.touches.length !== 2) return;
    stopImagePreviewDrag();
    imagePreviewPinchDistance = getTouchDistance(event.touches);
    imagePreviewPinchZoom = imagePreviewZoom;
}

function handleImagePreviewTouchMove(event) {
    if (event.touches.length !== 2 || imagePreviewPinchDistance <= 0) return;
    event.preventDefault();

    const currentDistance = getTouchDistance(event.touches);
    imagePreviewZoom = clamp(
        imagePreviewPinchZoom * (currentDistance / imagePreviewPinchDistance),
        IMAGE_PREVIEW_MIN_ZOOM,
        IMAGE_PREVIEW_MAX_ZOOM
    );
    updateImagePreviewZoom();
}

function handleImagePreviewTouchEnd() {
    imagePreviewPinchDistance = 0;
}

function stopImagePreviewDrag() {
    const viewport = document.getElementById('imagePreviewViewport');
    imagePreviewDragging = false;
    if (viewport) viewport.classList.remove('is-dragging');
}

function handleImagePreviewPointerDown(event) {
    const viewport = document.getElementById('imagePreviewViewport');
    if (!viewport || imagePreviewZoom <= IMAGE_PREVIEW_MIN_ZOOM || event.button > 0) return;

    imagePreviewDragging = true;
    imagePreviewDragStartX = event.clientX;
    imagePreviewDragStartY = event.clientY;
    imagePreviewDragScrollLeft = viewport.scrollLeft;
    imagePreviewDragScrollTop = viewport.scrollTop;
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture?.(event.pointerId);
}

function handleImagePreviewPointerMove(event) {
    const viewport = document.getElementById('imagePreviewViewport');
    if (!viewport || !imagePreviewDragging) return;

    event.preventDefault();
    viewport.scrollLeft = imagePreviewDragScrollLeft - (event.clientX - imagePreviewDragStartX);
    viewport.scrollTop = imagePreviewDragScrollTop - (event.clientY - imagePreviewDragStartY);
}

function handleImagePreviewPointerUp(event) {
    const viewport = document.getElementById('imagePreviewViewport');
    if (viewport) viewport.releasePointerCapture?.(event.pointerId);
    stopImagePreviewDrag();
}

function handleDocumentClick(event) {
    const stopTarget = event.target.closest('[data-stop-click]');
    if (stopTarget) event.stopPropagation();

    const linkTarget = event.target.closest('a[href]');
    if (linkTarget) trackLinkClick(linkTarget);

    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
        const action = actionTarget.dataset.action;
        if (action === 'toggle-sidebar') {
            event.preventDefault();
            toggleSidebar();
            return;
        }
        if (action === 'open-chat') {
            event.preventDefault();
            openChatModal();
            return;
        }
        if (action === 'close-chat') {
            event.preventDefault();
            closeChatModal();
            return;
        }
    }

    const cookieTarget = event.target.closest('[data-cookie-consent]');
    if (cookieTarget) {
        event.preventDefault();
        handleCookieConsent(cookieTarget.dataset.cookieConsent);
        return;
    }

    const previewSourceTarget = event.target.closest('[data-preview-src]');
    if (previewSourceTarget) {
        event.preventDefault();
        openImagePreview(previewSourceTarget.dataset.previewSrc);
        return;
    }

    const previewZoomTarget = event.target.closest('[data-preview-zoom]');
    if (previewZoomTarget) {
        event.preventDefault();
        zoomImagePreview(Number(previewZoomTarget.dataset.previewZoom));
        return;
    }

    const previewResetTarget = event.target.closest('[data-preview-reset]');
    if (previewResetTarget) {
        event.preventDefault();
        resetImagePreviewZoom();
        return;
    }

    const copyTextTarget = event.target.closest('[data-copy-text]');
    if (copyTextTarget) {
        event.preventDefault();
        trackEvent('Payments', 'payment_copy', 'account_name', {
            ...getOpenOfferContext(),
            copy_type: 'account_name',
        });
        copyToClipboard(copyTextTarget.dataset.copyText, copyTextTarget);
        return;
    }

    const copyIbanTarget = event.target.closest('[data-copy-iban]');
    if (copyIbanTarget) {
        event.preventDefault();
        trackEvent('Payments', 'payment_copy', 'iban', {
            ...getOpenOfferContext(),
            copy_type: 'iban',
        });
        copyIBAN(copyIbanTarget.dataset.copyIban, copyIbanTarget);
        return;
    }

    const tabTarget = event.target.closest('[data-tab-show]');
    if (tabTarget) {
        event.preventDefault();
        trackEvent('Offer Engagement', 'offer_tab_switch', tabTarget.dataset.tabShow, {
            ...getOpenOfferContext(),
            tab_show: tabTarget.dataset.tabShow,
        });
        switchTab(
            tabTarget.dataset.tabShow,
            tabTarget.dataset.tabHide,
            tabTarget.dataset.tabActive,
            tabTarget.dataset.tabInactive
        );
        return;
    }

    const sidebarTarget = event.target.closest('[data-sidebar-target]');
    if (sidebarTarget) {
        event.preventDefault();
        const modalId = sidebarTarget.dataset.sidebarTarget;
        toggleSidebar();
        setTimeout(() => openModal(modalId), 300);
        return;
    }

    const modalCloseTarget = event.target.closest('[data-modal-close]');
    if (modalCloseTarget) {
        event.preventDefault();
        const modalToClose = modalCloseTarget.dataset.modalClose;
        const modalToOpen = modalCloseTarget.dataset.modalTarget;
        closeModal(modalToClose);
        if (modalToOpen) openModal(modalToOpen);
        return;
    }

    const modalTarget = event.target.closest('[data-modal-target]');
    if (modalTarget) {
        event.preventDefault();
        openModal(modalTarget.dataset.modalTarget);
        return;
    }

    if (event.target.classList.contains('modal-backdrop')) closeModal(event.target.id);
    if (event.target.id === 'sidebarOverlay') toggleSidebar();
    if (event.target.id === 'chatModal') closeChatModal();
    if (event.target.id === 'imagePreviewModal') {
        closeModal('imagePreviewModal');
    }
}

function handleDocumentKeydown(event) {
    if ((event.key !== 'Enter' && event.key !== ' ') || !event.target.matches('[role="button"][data-modal-target]')) {
        return;
    }

    event.preventDefault();
    openModal(event.target.dataset.modalTarget);
}

function switchTab(showId, hideId, activeBtnId, inactiveBtnId) {
    document.getElementById(showId).classList.remove('hidden');
    document.getElementById(hideId).classList.add('hidden');
    const activeBtn = document.getElementById(activeBtnId);
    const inactiveBtn = document.getElementById(inactiveBtnId);
    
    const isVoda = activeBtnId.includes('v-') || activeBtnId === 'btn-v-port';
    const color = isVoda ? 'red' : 'blue';
    
    inactiveBtn.className = "flex-1 py-3 md:py-4 font-bold text-xs md:text-sm text-gray-500 hover:bg-gray-100 transition";
    activeBtn.className = `flex-1 py-3 md:py-4 font-bold text-xs md:text-sm text-${color}-600 border-b-4 border-${color}-600 bg-white`;
}

/* =========================================
   3. COPY FUNCTIONS
   ========================================= */
function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }

    return new Promise((resolve, reject) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand('copy') ? resolve() : reject(new Error('Copy failed'));
        } catch (error) {
            reject(error);
        } finally {
            textarea.remove();
        }
    });
}

function copyToClipboard(text, element) {
    writeClipboard(text).then(() => {
        const msg = element.querySelector('.copy-msg');
        const icon = element.querySelector('.fa-copy');
        if (msg) { msg.classList.remove('opacity-0'); msg.classList.add('opacity-100'); }
        if (icon) {
            icon.classList.remove('fa-copy', 'fa-regular');
            icon.classList.add('fa-check', 'fa-solid');
        }
        setTimeout(() => {
            if (msg) { msg.classList.remove('opacity-100'); msg.classList.add('opacity-0'); }
            if (icon) {
                icon.classList.remove('fa-check', 'fa-solid');
                icon.classList.add('fa-copy', 'fa-regular');
            }
        }, 2000);
    }).catch(() => showToast('Η αντιγραφή απέτυχε', 'error'));
}

async function copyIBAN(text, element) {
    try {
        await writeClipboard(text);
        showToast('Ο αριθμός λογαριασμού αντιγράφηκε!', 'success');
        const iconCopy = element.querySelector('.icon-copy');
        const iconCheck = element.querySelector('.icon-check');
        if (iconCopy && iconCheck) { iconCopy.classList.add('hidden'); iconCheck.classList.remove('hidden'); }
        element.classList.add('border-green-500', 'bg-green-50');
        setTimeout(() => {
            if (iconCopy && iconCheck) { iconCopy.classList.remove('hidden'); iconCheck.classList.add('hidden'); }
            element.classList.remove('border-green-500', 'bg-green-50');
        }, 2000);
    } catch (err) {
        showToast('Η αντιγραφή απέτυχε', 'error');
    }
}

/* =========================================
   4. CHATBOT — MOBILE FULL SCREEN + KEYBOARD
   ========================================= */

function _chatShowHeader() {
    const header = document.getElementById('chatHeader');
    const btn = document.getElementById('chatFloatingClose');
    if (header) header.classList.remove('chat-header-hidden');
    if (btn) btn.style.display = 'none';
}

function _chatHideHeader() {
    const header = document.getElementById('chatHeader');
    const btn = document.getElementById('chatFloatingClose');
    if (header) header.classList.add('chat-header-hidden');
    if (btn) btn.style.display = 'flex';
}

function openChatModal() {
    const modal = document.getElementById('chatModal');
    const content = document.getElementById('chatModalContent');
    if (!modal || !content) return;

    _chatShowHeader();

    modal.classList.remove('hidden');
    loadDeferredIframes(modal);
    lockPageScroll();

    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('translate-y-full', 'md:translate-y-10', 'md:scale-95');
        content.classList.add('translate-y-0', 'md:scale-100');
    });

    trackEvent('Chatbot', 'Open', 'AI Assistant UI');
}

function closeChatModal() {
    const modal = document.getElementById('chatModal');
    const content = document.getElementById('chatModalContent');
    if (!modal || !content) return;

    _chatShowHeader();
    modal.classList.add('opacity-0');
    content.classList.remove('translate-y-0', 'md:scale-100');
    content.classList.add('translate-y-full', 'md:translate-y-10', 'md:scale-95');

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.style.top = '';
        modal.style.height = '';
        unlockPageScrollIfIdle();
    }, 400);
}

// VisualViewport Handling για κινητά (Πληκτρολόγιο)
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        const modal = document.getElementById('chatModal');
        if (!modal || modal.classList.contains('hidden') || window.innerWidth >= 768) return;

        const vvH = window.visualViewport.height;
        const vvT = window.visualViewport.offsetTop;
        modal.style.top = `${vvT}px`;
        modal.style.height = `${vvH}px`;

        if (vvH < window.screen.height * 0.75) _chatHideHeader();
        else _chatShowHeader();
    });
}

window.addEventListener('message', (event) => {
    if (event.origin !== CHATBOT_ORIGIN) return;
    if (event.data === 'closeChat') closeChatModal();
    if (event.data === 'message-sent' || event.data === 'close-keyboard') {
        document.activeElement.blur();
    }
});

/* =========================================
   5. COOKIE CONSENT
   ========================================= */
function handleCookieConsent(action) {
    const banner = document.getElementById('cookieConsentBanner');
    if (!banner) return;
    if (action === 'accept') {
        localStorage.setItem('cookieConsent', 'accepted');
        loadAllTracking();
        trackEvent('Consent', 'analytics_consent_accept', 'Cookie Banner');
        showToast('Οι προτιμήσεις αποθηκεύτηκαν', 'success');
    } else {
        localStorage.setItem('cookieConsent', 'rejected');
        showToast('Τα cookies απορρίφθηκαν', 'info');
    }
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(100%)';
    setTimeout(() => banner.classList.add('hidden'), 500);
}

/* =========================================
   6. INITIALIZATION & ROUTING
   ========================================= */
let pageInitialized = false;

function initializePage() {
    if (pageInitialized) return;
    pageInitialized = true;

    // Preloader
    const preloader = document.getElementById('preloader');
    if (preloader) {
        setTimeout(() => {
            preloader.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => { preloader.style.display = 'none'; document.body.classList.remove('loading'); }, 700);
        }, 300);
    }

    // Cookies Check
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
        setTimeout(() => { document.getElementById('cookieConsentBanner')?.classList.remove('hidden'); }, 1000);
    } else if (consent === 'accepted') {
        loadAllTracking();
    }

    // Hash Routing (nyxlabs.gr/#modalID)
    openModalFromHash();
    setTimeout(openModalFromHash, 0);

    // Delegated UI listeners
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            stopAllOfferViews({ beacon: true });
            stopAllOfferCardViews({ beacon: true });
        } else {
            resumeOpenOfferViews();
            refreshVisibleOfferCards();
        }
    });
    window.addEventListener('pagehide', () => {
        stopAllOfferViews({ beacon: true });
        stopAllOfferCardViews({ beacon: true });
    });

    window.addEventListener('hashchange', openModalFromHash);

    const imagePreviewViewport = document.getElementById('imagePreviewViewport');
    if (imagePreviewViewport) {
        imagePreviewViewport.addEventListener('wheel', handleImagePreviewWheel, { passive: false });
        imagePreviewViewport.addEventListener('touchstart', handleImagePreviewTouchStart, { passive: true });
        imagePreviewViewport.addEventListener('touchmove', handleImagePreviewTouchMove, { passive: false });
        imagePreviewViewport.addEventListener('touchend', handleImagePreviewTouchEnd);
        imagePreviewViewport.addEventListener('touchcancel', handleImagePreviewTouchEnd);
        imagePreviewViewport.addEventListener('pointerdown', handleImagePreviewPointerDown);
        imagePreviewViewport.addEventListener('pointermove', handleImagePreviewPointerMove);
        imagePreviewViewport.addEventListener('pointerup', handleImagePreviewPointerUp);
        imagePreviewViewport.addEventListener('pointercancel', stopImagePreviewDrag);
        imagePreviewViewport.addEventListener('mouseleave', stopImagePreviewDrag);
    }

    window.addEventListener('keydown', (event) => {
        const modal = document.getElementById('imagePreviewModal');
        if (!modal || modal.classList.contains('hidden')) return;

        if (event.key === 'Escape') closeModal('imagePreviewModal');
        if (event.key === '+' || event.key === '=') zoomImagePreview(0.25);
        if (event.key === '-') zoomImagePreview(-0.25);
        if (event.key === '0') resetImagePreviewZoom();
    });

    // Intersection Observer για τα Animations (Reveal)
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal').forEach((el, i) => {
        el.style.transitionDelay = `${i * 100}ms`;
        observer.observe(el);
    });

    initializeOfferCardTracking();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePage, { once: true });
} else {
    initializePage();
}

// Διαχείριση "Πίσω" στο Browser
window.onpopstate = function (event) {
    document.querySelectorAll('.modal-backdrop').forEach((modal) => {
        if (!modal.classList.contains('hidden')) stopOfferView(modal.id);
        modal.classList.add('hidden');
    });
    document.getElementById('imagePreviewModal')?.classList.add('hidden');
    unlockPageScrollIfIdle();
    requestAnimationFrame(refreshVisibleOfferCards);

    if (event.state && event.state.modalId) {
        const modal = document.getElementById(event.state.modalId);
        if (modal) {
            modal.classList.remove('hidden');
            loadDeferredIframes(modal);
            lockPageScroll();
            startOfferView(event.state.modalId);
        }
    }
};

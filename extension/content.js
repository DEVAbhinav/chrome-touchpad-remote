// Content script for Chrome Touchpad Remote
// Handles mouse simulation based on touch events from iPhone

(function () {
    // Prevent multiple injections
    if (window.__touchpadControlActive) return;
    window.__touchpadControlActive = true;

    // Virtual cursor state
    let cursorX = window.innerWidth / 2;
    let cursorY = window.innerHeight / 2;
    let cursorVisible = false;
    let cursorElement = null;
    let hideTimer = null;

    // Create virtual cursor element
    function createCursor() {
        if (cursorElement) return;

        cursorElement = document.createElement('div');
        cursorElement.id = 'touchpad-cursor';
        cursorElement.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 4L10.5 20L12.5 13.5L19 11.5L4 4Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    `;

        Object.assign(cursorElement.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '24px',
            height: '24px',
            pointerEvents: 'none',
            zIndex: '2147483647',
            transform: `translate(${cursorX}px, ${cursorY}px)`,
            transition: 'transform 0.18s linear, opacity 0.2s', // Longer transition = buttery smooth
            opacity: '0',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
            willChange: 'transform' // GPU acceleration
        });

        document.body.appendChild(cursorElement);
    }

    function showCursor() {
        if (!cursorElement) createCursor();
        cursorElement.style.opacity = '1';
        cursorVisible = true;

        // Auto-hide after 3 seconds of inactivity
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            if (cursorElement) {
                cursorElement.style.opacity = '0';
                cursorVisible = false;
            }
        }, 3000);
    }

    function updateCursorPosition() {
        if (cursorElement) {
            cursorElement.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
        }
    }

    // Clamp cursor to viewport
    function clampCursor() {
        cursorX = Math.max(0, Math.min(window.innerWidth - 1, cursorX));
        cursorY = Math.max(0, Math.min(window.innerHeight - 1, cursorY));
    }

    // Get element at cursor position
    function getElementAtCursor() {
        // Temporarily hide cursor to not interfere with elementFromPoint
        if (cursorElement) cursorElement.style.display = 'none';
        const element = document.elementFromPoint(cursorX, cursorY);
        if (cursorElement) cursorElement.style.display = '';
        return element;
    }

    // Simulate mouse event
    function simulateMouseEvent(type, options = {}) {
        const element = getElementAtCursor();
        if (!element) return;

        let event;
        if (type.startsWith('pointer')) {
            event = new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: cursorX,
                clientY: cursorY,
                screenX: cursorX + window.screenX,
                screenY: cursorY + window.screenY,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                button: options.button || 0,
                buttons: options.buttons || (type === 'mousedown' ? 1 : 0),
                ...options
            });
        } else {
            event = new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: cursorX,
                clientY: cursorY,
                screenX: cursorX + window.screenX,
                screenY: cursorY + window.screenY,
                button: options.button || 0,
                buttons: options.buttons || (type === 'mousedown' ? 1 : 0),
                ...options
            });
        }

        element.dispatchEvent(event);
        return element;
    }

    // Simulate click sequence - UNIVERSAL FIX for all video players
    function simulateClick() {
        let element = getElementAtCursor();
        if (!element) return;

        // DEBUG: Log what we're clicking
        console.log('[Touchpad] Click at:', cursorX, cursorY);
        console.log('[Touchpad] Element:', element.tagName, element.className, element.id);
        console.log('[Touchpad] Element type:', element.constructor.name);

        // FIX: If we hit SVG or text node, find nearest HTMLElement parent
        // SVG elements and text nodes don't have .click() method
        if (!(element instanceof HTMLElement)) {
            console.log('[Touchpad] Not HTMLElement, finding parent...');
            let parent = element.parentElement;
            while (parent && !(parent instanceof HTMLElement)) {
                parent = parent.parentElement;
            }
            if (parent) {
                element = parent;
                console.log('[Touchpad] Using parent:', element.tagName, element.className);
            }
        }

        // Create click ripple effect
        createClickEffect();

        // Check if this is an input element
        const inputElement = element.closest('input, textarea, select, [contenteditable="true"]');

        // STRATEGY: Aggressive multi-click for video players

        // 1. Fire ALL event types with proper coordinates
        const eventOptions = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: cursorX,
            clientY: cursorY,
            screenX: cursorX,
            screenY: cursorY
        };

        simulateMouseEvent('mousedown');
        simulateMouseEvent('pointerdown');

        setTimeout(() => {
            simulateMouseEvent('mouseup');
            simulateMouseEvent('pointerup');
            simulateMouseEvent('click');

            // 2. Direct click on element (only if it's an HTMLElement)
            if (element instanceof HTMLElement && typeof element.click === 'function') {
                try {
                    console.log('[Touchpad] Calling element.click() on', element.tagName);
                    element.click();
                } catch (e) {
                    console.log('[Touchpad] Direct click failed:', e.message);
                }
            }

            // 3. CRITICAL: Find and click the nearest BUTTON element
            // Video controls are usually in <button> tags
            const button = element.closest('button, [role="button"], a');
            if (button && button !== element && button instanceof HTMLElement) {
                console.log('[Touchpad] Found button parent:', button.tagName, button.className);
                try {
                    button.click();
                } catch (e) {
                    console.log('[Touchpad] Button click failed:', e.message);
                }
            }

            // 4. Click ALL parents up to 10 levels (for addEventListener-based controls)
            let parent = element.parentElement;
            let depth = 0;
            const maxDepth = 10;

            while (parent && depth < maxDepth) {
                try {
                    if (parent instanceof HTMLElement && typeof parent.click === 'function') {
                        const info = `${parent.tagName}.${parent.className || 'no-class'}#${parent.id || 'no-id'}`;
                        console.log(`[Touchpad] Clicking parent ${depth}:`, info);
                        parent.click();

                        // Also dispatch click event
                        parent.dispatchEvent(new MouseEvent('click', eventOptions));
                    }
                } catch (e) {
                    console.log(`[Touchpad] Parent ${depth} click failed:`, e.message);
                }
                parent = parent.parentElement;
                depth++;
            }

            // 5. Check shadow DOM
            if (element.shadowRoot) {
                const shadowElement = element.shadowRoot.elementFromPoint(cursorX, cursorY);
                if (shadowElement && shadowElement instanceof HTMLElement) {
                    try {
                        console.log('[Touchpad] Clicking shadow element:', shadowElement.tagName);
                        shadowElement.click();
                    } catch (e) {
                        console.log('[Touchpad] Shadow click failed:', e.message);
                    }
                }
            }

            // 6. Handle inputs
            if (inputElement) {
                if (document.activeElement && document.activeElement !== inputElement) {
                    document.activeElement.blur();
                }

                inputElement.focus();
                if (typeof inputElement.click === 'function') {
                    inputElement.click();
                }
                inputElement.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

                if (inputElement.type === 'search' || inputElement.type === 'text' ||
                    inputElement.getAttribute('role') === 'combobox') {
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                }

                chrome.runtime.sendMessage({
                    type: 'inputFocused',
                    inputType: inputElement.type || 'text',
                    placeholder: inputElement.placeholder || '',
                    currentValue: inputElement.value || ''
                }).catch((e) => console.log('[Touchpad] Failed to notify input focus:', e.message));
            } else {
                if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                    document.activeElement.blur();
                }

                chrome.runtime.sendMessage({ type: 'inputBlurred' })
                    .catch((e) => console.log('[Touchpad] Failed to notify input blur:', e.message));

                // 7. SPECIAL: If clicking on a video, directly control play/pause
                // This bypasses Chrome's user gesture restriction
                const videoElement = document.querySelector('video');

                if (videoElement) {
                    console.log('[Touchpad] Found video element, directly toggling play/pause');
                    console.log('[Touchpad] Video paused:', videoElement.paused);

                    if (videoElement.paused) {
                        videoElement.play().catch(e => {
                            console.log('[Touchpad] Play failed:', e.message);
                            // Fallback to keyboard
                            simulateKeyPress(' ');
                        });
                    } else {
                        videoElement.pause();
                    }
                }
            }
        }, 30);
    }

    // Simulate double click
    function simulateDoubleClick() {
        simulateClick();
        setTimeout(() => {
            simulateClick();
            simulateMouseEvent('dblclick');
        }, 100);
    }

    // Simulate right click (context menu)
    function simulateRightClick() {
        const element = getElementAtCursor();
        if (!element) return;

        createClickEffect();

        const event = new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: cursorX,
            clientY: cursorY,
            button: 2,
            buttons: 2
        });

        element.dispatchEvent(event);
    }

    // Simulate scroll
    function simulateScroll(deltaX, deltaY) {
        const element = getElementAtCursor() || document.documentElement;

        // Increase scroll amount for better feel
        const scrollMultiplier = 1.5;
        const scrollX = deltaX * scrollMultiplier;
        const scrollY = deltaY * scrollMultiplier;

        const event = new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: cursorX,
            clientY: cursorY,
            deltaX: scrollX,
            deltaY: scrollY,
            deltaMode: 0 // Pixels
        });

        const prevented = !element.dispatchEvent(event);

        // If event wasn't handled, use native scroll as fallback
        if (!prevented) {
            const scrollable = findScrollableParent(element);
            if (scrollable && scrollable !== document.documentElement) {
                scrollable.scrollBy(scrollX, scrollY);
            } else {
                window.scrollBy(scrollX, scrollY);
            }
        }
    }

    // Find scrollable parent element
    function findScrollableParent(element) {
        while (element && element !== document.body) {
            const style = window.getComputedStyle(element);
            const overflowY = style.overflowY;
            const overflowX = style.overflowX;

            if (overflowY === 'scroll' || overflowY === 'auto' ||
                overflowX === 'scroll' || overflowX === 'auto') {
                if (element.scrollHeight > element.clientHeight ||
                    element.scrollWidth > element.clientWidth) {
                    return element;
                }
            }
            element = element.parentElement;
        }
        return document.documentElement;
    }

    // Visual feedback for click
    function createClickEffect() {
        const effect = document.createElement('div');
        effect.style.cssText = `
      position: fixed;
      left: ${cursorX}px;
      top: ${cursorY}px;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(66, 133, 244, 0.4);
      transform: translate(-50%, -50%) scale(0);
      pointer-events: none;
      z-index: 2147483646;
      animation: touchpad-click 0.3s ease-out forwards;
    `;

        // Add animation keyframes if not exists
        if (!document.getElementById('touchpad-styles')) {
            const styles = document.createElement('style');
            styles.id = 'touchpad-styles';
            styles.textContent = `
        @keyframes touchpad-click {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
        }
      `;
            document.head.appendChild(styles);
        }

        document.body.appendChild(effect);
        setTimeout(() => effect.remove(), 300);
    }

    // Simulate typing text - using modern InputEvent API
    function simulateTyping(text) {
        // First try the currently focused element
        let inputElement = document.activeElement;

        // If no focused input, try element at cursor
        if (!inputElement || (inputElement.tagName !== 'INPUT' && inputElement.tagName !== 'TEXTAREA' && !inputElement.isContentEditable)) {
            const element = getElementAtCursor();
            if (element) {
                inputElement = element.closest('input, textarea, [contenteditable="true"]');
            }
        }

        if (!inputElement) return;

        // Focus if not already
        inputElement.focus();

        // For input/textarea, set value directly
        if (inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA') {
            const start = inputElement.selectionStart || inputElement.value.length;
            const end = inputElement.selectionEnd || inputElement.value.length;
            const currentValue = inputElement.value;
            inputElement.value = currentValue.slice(0, start) + text + currentValue.slice(end);
            inputElement.selectionStart = inputElement.selectionEnd = start + text.length;

            // Dispatch input event to trigger any listeners
            inputElement.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'insertText',
                data: text
            }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (inputElement.isContentEditable) {
            // For contenteditable, use modern Input Events API
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const textNode = document.createTextNode(text);
                range.insertNode(textNode);

                // Move cursor to end of inserted text
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);

                // Dispatch input event
                inputElement.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    inputType: 'insertText',
                    data: text
                }));
            }
        }
    }

    // Simulate a single key press
    function simulateKeyPress(key) {
        // For video controls, dispatch to document, not activeElement
        const targetElement = (key === ' ' || key === 'f' || key === 'F') ? document.body : (document.activeElement || getElementAtCursor());
        if (!targetElement) return;

        const keyCode = key === 'Enter' ? 13 :
            key === 'Backspace' ? 8 :
                key === 'Tab' ? 9 :
                    key === 'Escape' ? 27 :
                        key === ' ' ? 32 :
                            key === 'f' || key === 'F' ? 70 :
                                key.charCodeAt(0);

        console.log('[Touchpad] Simulating key press:', key, 'keyCode:', keyCode, 'target:', targetElement.tagName);

        // Dispatch keydown
        targetElement.dispatchEvent(new KeyboardEvent('keydown', {
            key: key,
            code: key === ' ' ? 'Space' : (key === 'f' || key === 'F' ? 'KeyF' : key),
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        }));

        // Also dispatch to document for video players
        if (targetElement !== document) {
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: key,
                code: key === ' ' ? 'Space' : (key === 'f' || key === 'F' ? 'KeyF' : key),
                keyCode: keyCode,
                which: keyCode,
                bubbles: true,
                cancelable: true
            }));
        }

        // Handle Backspace specially for input elements
        if (key === 'Backspace' && (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA')) {
            const start = targetElement.selectionStart || 0;
            const end = targetElement.selectionEnd || 0;
            if (start === end && start > 0) {
                targetElement.value = targetElement.value.slice(0, start - 1) + targetElement.value.slice(end);
                targetElement.selectionStart = targetElement.selectionEnd = start - 1;
            } else if (start !== end) {
                targetElement.value = targetElement.value.slice(0, start) + targetElement.value.slice(end);
                targetElement.selectionStart = targetElement.selectionEnd = start;
            }
            targetElement.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                inputType: 'deleteContentBackward'
            }));
        }

        // Handle Enter for forms
        if (key === 'Enter') {
            const form = targetElement.closest('form');
            if (form) {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        }

        // Dispatch keyup
        targetElement.dispatchEvent(new KeyboardEvent('keyup', {
            key: key,
            code: key === ' ' ? 'Space' : (key === 'f' || key === 'F' ? 'KeyF' : key),
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        }));

        // Also dispatch to document
        if (targetElement !== document) {
            document.dispatchEvent(new KeyboardEvent('keyup', {
                key: key,
                code: key === ' ' ? 'Space' : (key === 'f' || key === 'F' ? 'KeyF' : key),
                keyCode: keyCode,
                which: keyCode,
                bubbles: true,
                cancelable: true
            }));
        }
    }

    // Handle touch events from background script
    function handleTouchEvent(data) {
        switch (data.action) {
            case 'move':
                cursorX += data.dx;
                cursorY += data.dy;
                clampCursor();
                showCursor();
                updateCursorPosition();

                // Dispatch mousemove and pointermove for modern apps
                simulateMouseEvent('mousemove');
                simulateMouseEvent('pointermove');
                simulateMouseEvent('mouseover');
                break;

            case 'click':
                showCursor();
                simulateClick();
                break;

            case 'doubleclick':
                showCursor();
                simulateDoubleClick();
                break;

            case 'rightclick':
                showCursor();
                simulateRightClick();
                break;

            case 'scroll':
                simulateScroll(data.dx || 0, data.dy || 0);
                break;

            case 'type':
                if (data.text) {
                    simulateTyping(data.text);
                }
                break;

            case 'key':
                if (data.key) {
                    // Special handling for fullscreen key
                    if (data.key === 'f' || data.key === 'F') {
                        const video = document.querySelector('video');
                        const player = video?.closest('[class*="player"]') ||
                            video?.closest('[class*="watch"]') ||
                            video?.parentElement;

                        if (document.fullscreenElement) {
                            // Exit fullscreen
                            document.exitFullscreen().catch(e => {
                                console.log('[Touchpad] Exit fullscreen failed:', e.message);
                            });
                        } else if (player) {
                            // Enter fullscreen on player container
                            player.requestFullscreen().catch(e => {
                                console.log('[Touchpad] Fullscreen failed on player, trying video:', e.message);
                                // Try video element directly
                                if (video) {
                                    video.requestFullscreen().catch(e2 => {
                                        console.log('[Touchpad] Video fullscreen also failed:', e2.message);
                                        // Last resort: keyboard
                                        simulateKeyPress('f');
                                    });
                                }
                            });
                        } else if (video) {
                            video.requestFullscreen().catch(e => {
                                console.log('[Touchpad] Video fullscreen failed:', e.message);
                            });
                        }
                    } else {
                        simulateKeyPress(data.key);
                    }
                }
                break;
        }
    }

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'touch') {
            handleTouchEvent(message);
        }
        if (message.type === 'setVolume') {
            // Set volume on all video and audio elements
            const mediaElements = document.querySelectorAll('video, audio');
            mediaElements.forEach(el => {
                el.volume = message.volume;
            });
        }
    });

    // KEEP-ALIVE HEARTBEAT
    // Pings the background script every 20 seconds to keep the Service Worker alive
    setInterval(() => {
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({ type: 'keepAlive' })
                .catch((e) => console.log('[Touchpad] Keepalive failed - extension may have reloaded'));
        }
    }, 20000);

    // Initialize cursor
    if (document.body) {
        createCursor();
    } else {
        document.addEventListener('DOMContentLoaded', createCursor);
    }

    console.log('[Touchpad] Content script loaded');
})();

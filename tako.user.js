// ==UserScript==
// @name         Tako
// @namespace    tako
// @version      1.0
// @description  Show EN translations for some Hololive JP VTubers
// @author       Shorelined
// @match        https://www.youtube.com/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    const SUBTITLE_BASE = "https://raw.githubusercontent.com/shorelined/tako/refs/heads/main/data/";
    const GITHUB_CONTENTS_API = "https://api.github.com/repos/shorelined/tako/contents/data";
    const POLL_INTERVAL = 200;

    let overlay = null;
    let subtitleText = null;
    let currentVideoId = null;
    let subtitleEntries = null;

    let translatedIds = null;

    function createOverlay() {
        if (overlay) return;

        overlay = document.createElement("div");
        overlay.id = "tako-overlay";
        overlay.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 999999;
            display: none;
            text-align: center;
            cursor: grab;
        `;

        subtitleText = document.createElement("div");
        subtitleText.id = "tako-subtitle";
        subtitleText.style.cssText = `
            color: #FFFFFF;
            font-family: Arial, Helvetica, sans-serif;
            font-size: clamp(32px, 3vw, 52px);
            font-weight: bold;
            line-height: 1.3;
            text-shadow:
                -2px -2px 0 #000,
                    2px -2px 0 #000,
                -2px    2px 0 #000,
                    2px    2px 0 #000;
            padding: 0 20px;
        `;
        overlay.appendChild(subtitleText);

        const dragBackdrop = document.createElement("div");
        dragBackdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0);
            z-index: 999998;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s ease, background 0.15s ease;
        `;

        const centerLine = document.createElement("div");
        centerLine.style.cssText = `
            position: absolute;
            left: 50%;
            top: 0;
            width: 2px;
            height: 100%;
            background: rgba(255, 255, 255, 0.5);
            transform: translateX(-50%);
        `;

        dragBackdrop.appendChild(centerLine);
        document.body.appendChild(dragBackdrop);

        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        const SNAP_THRESHOLD = 50;

        overlay.addEventListener("mousedown", (e) => {
            isDragging = true;
            const rect = overlay.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left - rect.width / 2;
            dragOffsetY = e.clientY - rect.bottom;
            overlay.style.cursor = "grabbing";
            dragBackdrop.style.opacity = "1";
            dragBackdrop.style.background = "rgba(0, 0, 0, 0.3)";
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            const newX = e.clientX - dragOffsetX;
            const screenCenterX = window.innerWidth / 2;
            if (Math.abs(newX - screenCenterX) < SNAP_THRESHOLD) {
                overlay.style.left = "50%";
            } else {
                overlay.style.left = newX + "px";
            }
            overlay.style.transform = "translateX(-50%)";
            overlay.style.bottom =
                window.innerHeight - e.clientY + dragOffsetY + "px";
        });

        document.addEventListener("mouseup", () => {
            if (isDragging) {
                isDragging = false;
                overlay.style.cursor = "grab";
                dragBackdrop.style.opacity = "0";
                dragBackdrop.style.background = "rgba(0, 0, 0, 0)";
            }
        });

        document.body.appendChild(overlay);
    }

    function showSubtitle(text) {
        if (!overlay) createOverlay();
        if (text) {
            subtitleText.textContent = text;
            overlay.style.display = "block";
        } else {
            overlay.style.display = "none";
        }
    }

    async function fetchSubtitles(videoId) {
        try {
            const res = await fetch(`${SUBTITLE_BASE}${videoId}.json`);
            if (!res.ok) return null;
            const data = await res.json();
            return Array.isArray(data.entries) ? data.entries : null;
        } catch (e) {
            return null;
        }
    }

    function findSubtitle(entries, currentTime) {
        for (const entry of entries) {
            const start = parseFloat(entry.start);
            const end = parseFloat(entry.end);
            if (currentTime >= start && currentTime < end) {
                return entry.text;
            }
        }
        return null;
    }

    function getVideoId() {
        return new URLSearchParams(window.location.search).get("v");
    }

    async function onVideoChange(videoId) {
        currentVideoId = videoId;
        subtitleEntries = null;
        showSubtitle(null);

        if (!videoId) return;

        const entries = await fetchSubtitles(videoId);
        if (currentVideoId !== videoId) return; // navigated away while fetching
        subtitleEntries = entries;
    }

    function poll() {
        const videoId = getVideoId();

        if (videoId !== currentVideoId) {
            onVideoChange(videoId);
            return;
        }

        if (!subtitleEntries) {
            showSubtitle(null);
            return;
        }

        const video = document.querySelector("video");
        if (!video) {
            showSubtitle(null);
            return;
        }

        showSubtitle(findSubtitle(subtitleEntries, video.currentTime));
    }

    function extractVideoId(href) {
        try {
            return new URL(href, location.origin).searchParams.get("v");
        } catch {
            return null;
        }
    }

    function getVideoIdFromThumbnail(el) {
        // New lockup style: yt-thumbnail-view-model is inside <a href="...watch?v=...">
        const parentA = el.closest('a[href*="watch"]');
        if (parentA) return extractVideoId(parentA.href);
        // Old style: a#thumbnail has the href directly
        if (el.tagName === "A" && el.href) return extractVideoId(el.href);
        return null;
    }

    function addEnBadge(el) {
        if (el.dataset.takoTagged) return;
        el.dataset.takoTagged = "1";

        const videoId = getVideoIdFromThumbnail(el);
        if (!videoId || !translatedIds.has(videoId)) return;

        if (getComputedStyle(el).position === "static") {
            el.style.position = "relative";
        }

        const badge = document.createElement("div");
        badge.style.cssText = `
            position: absolute;
            top: 4px;
            left: 4px;
            z-index: 100;
            background: rgba(0, 112, 220, 0.88);
            color: #fff;
            font: bold 11px/1.4 Arial, sans-serif;
            padding: 2px 6px;
            border-radius: 3px;
            pointer-events: none;
            letter-spacing: 0.5px;
        `;
        badge.textContent = "EN";
        el.appendChild(badge);
    }

    function tagAllThumbnails() {
        document
            .querySelectorAll("yt-thumbnail-view-model, a#thumbnail")
            .forEach(addEnBadge);
    }

    async function loadTranslatedIds() {
        try {
            const res = await fetch(GITHUB_CONTENTS_API);
            if (!res.ok) {
                translatedIds = new Set();
                return;
            }
            const files = await res.json();
            translatedIds = new Set(
                files
                    .filter((f) => f.type === "file" && f.name.endsWith(".json"))
                    .map((f) => f.name.slice(0, -5))
            );
        } catch {
            translatedIds = new Set();
        }
        tagAllThumbnails();
    }

    const thumbnailObserver = new MutationObserver((mutations) => {
        if (!translatedIds) return;
        for (const { addedNodes } of mutations) {
            for (const node of addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches("yt-thumbnail-view-model, a#thumbnail")) {
                    addEnBadge(node);
                }
                node
                    .querySelectorAll("yt-thumbnail-view-model, a#thumbnail")
                    .forEach(addEnBadge);
            }
        }
    });

    thumbnailObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });

    loadTranslatedIds();
    createOverlay();
    setInterval(poll, POLL_INTERVAL);
    poll();
})();

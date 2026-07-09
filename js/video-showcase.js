/**
 * VINTUS PERFORMANCE
 * Video Showcase — Symmetrical 3-Up Grid
 * ====================================
 * Lazy loads all three videos and autoplays them together
 * once the showcase scrolls into view; pauses when off-screen.
 */
(function() {
    'use strict';

    var showcase = document.getElementById('videoShowcase');
    if (!showcase) return;

    var videos = showcase.querySelectorAll('.showcase-video');
    var videosLoaded = [];

    for (var i = 0; i < videos.length; i++) {
        videosLoaded.push(false);
    }

    // --- Lazy load video source ---
    function loadVideo(index) {
        if (videosLoaded[index]) return;
        var video = videos[index];
        var source = video.querySelector('source[data-src]');
        if (source && source.dataset.src) {
            source.src = source.dataset.src;
            source.removeAttribute('data-src');
            video.load();
            videosLoaded[index] = true;
        }
    }

    function playAll() {
        for (var i = 0; i < videos.length; i++) {
            loadVideo(i);
            var playPromise = videos[i].play();
            if (playPromise !== undefined) {
                playPromise.catch(function() {
                    // Autoplay blocked — poster image shown as fallback
                });
            }
        }
    }

    function pauseAll() {
        for (var i = 0; i < videos.length; i++) {
            videos[i].pause();
        }
    }

    // --- Intersection Observer (lazy load + play/pause) ---
    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    playAll();
                } else {
                    pauseAll();
                }
            });
        }, { threshold: 0.3 });

        observer.observe(showcase);
    } else {
        // Fallback: load and play immediately
        playAll();
    }
})();

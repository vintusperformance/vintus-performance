/**
 * Vintus Performance — Workout Detail Page
 * Loads workout session from /api/v1/dashboard/workout/:sessionId
 * Handles completion via /api/v1/workout/:sessionId/complete
 */

(function () {
  // Auth guard
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }
  if (localStorage.getItem('vintus_role') === 'ADMIN') {
    window.location.href = '/admin';
    return;
  }

  var params = new URLSearchParams(window.location.search);
  var sessionId = params.get('id');

  var loadingEl = document.getElementById('workoutLoading');
  var errorEl = document.getElementById('workoutError');
  var errorMsg = document.getElementById('workoutErrorMsg');
  var contentEl = document.getElementById('workoutContent');

  if (!sessionId) {
    showError('No workout ID found. Please go back to your dashboard.');
    return;
  }

  var sessionData = null;
  var canSwap = false;
  var approvedVideoMap = {};
  var approvedVideoMapLower = {};
  loadWorkout();

  async function loadWorkout() {
    try {
      var videoMapPromise = apiGet('/api/v1/workout/exercise-videos').catch(function () { return null; });
      var res = await apiGet('/api/v1/dashboard/workout/' + sessionId);

      if (!res.success || !res.data) {
        showError('Unable to load this workout. It may have been removed or rescheduled.');
        return;
      }

      var videoRes = await videoMapPromise;
      if (videoRes && videoRes.success && videoRes.data) {
        approvedVideoMap = videoRes.data;
        // Case-insensitive lookup key so a plan's exercise text ("barbell
        // bench press") still matches an admin-approved video keyed by its
        // canonical Title Case name ("Barbell Bench Press").
        approvedVideoMapLower = {};
        Object.keys(approvedVideoMap).forEach(function (name) {
          approvedVideoMapLower[name.toLowerCase()] = approvedVideoMap[name];
        });
      }

      sessionData = res.data;
      canSwap = res.data.planTier === 'PRIVATE_COACHING' && res.data.status === 'SCHEDULED';
      renderWorkout(res.data);
    } catch (err) {
      showError(err.message || 'Failed to load workout.');
    }
  }

  function renderWorkout(data) {
    // Title
    document.getElementById('workoutTitle').textContent = data.title || 'Workout';

    // Meta badges
    var metaEl = document.getElementById('workoutMeta');
    var badges = [];

    if (data.sessionType) {
      badges.push(data.sessionType.replace(/_/g, ' '));
    }
    if (data.prescribedDuration) {
      badges.push(data.prescribedDuration + ' min');
    }
    if (data.scheduledDate) {
      var d = new Date(data.scheduledDate);
      badges.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    }
    if (data.status) {
      badges.push(data.status);
    }

    metaEl.innerHTML = badges.map(function (b) {
      return '<span class="workout-badge">' + escapeHtml(b) + '</span>';
    }).join('');

    // Description
    if (data.description) {
      document.getElementById('workoutDesc').textContent = data.description;
    }

    // Parse content JSON
    var content = data.content;
    if (typeof content === 'string') {
      try { content = JSON.parse(content); } catch (e) { content = null; }
    }

    if (content) {
      // Warmup
      if (content.warmup && content.warmup.length > 0) {
        var warmupPhase = document.getElementById('warmupPhase');
        var warmupList = document.getElementById('warmupList');
        warmupPhase.style.display = 'block';

        content.warmup.forEach(function (ex, idx) {
          var card = document.createElement('div');
          card.className = 'exercise-card simple';
          card.innerHTML =
            '<div>' +
              '<div class="exercise-name">' + escapeHtml(ex.exercise) + '</div>' +
              (ex.notes ? '<div class="exercise-notes">' + escapeHtml(ex.notes) + '</div>' : '') +
            '</div>' +
            (ex.duration ? '<span class="exercise-duration">' + escapeHtml(ex.duration) + '</span>' : '');
          var warmupVideoBtn = addVideoButton(ex.exercise);
          if (warmupVideoBtn) card.appendChild(warmupVideoBtn);
          card.appendChild(addCompleteToggle(card, 'warmup', idx));
          warmupList.appendChild(card);
        });
      }

      // Main exercises
      if (content.main && content.main.length > 0) {
        var mainPhase = document.getElementById('mainPhase');
        var mainList = document.getElementById('mainList');
        mainPhase.style.display = 'block';

        content.main.forEach(function (ex, idx) {
          var card = document.createElement('div');
          card.className = 'exercise-card';

          var detailsHtml = '';
          if (ex.sets) {
            detailsHtml += '<div class="exercise-detail"><span class="exercise-detail-label">Sets</span><span class="exercise-detail-value">' + ex.sets + '</span></div>';
          }
          if (ex.reps) {
            detailsHtml += '<div class="exercise-detail"><span class="exercise-detail-label">Reps</span><span class="exercise-detail-value">' + escapeHtml(String(ex.reps)) + '</span></div>';
          }
          if (ex.rest) {
            detailsHtml += '<div class="exercise-detail"><span class="exercise-detail-label">Rest</span><span class="exercise-detail-value">' + escapeHtml(normalizeRest(ex.rest)) + '</span></div>';
          }
          if (ex.intensity) {
            detailsHtml += '<div class="exercise-detail"><span class="exercise-detail-label">Intensity</span><span class="exercise-detail-value">' + escapeHtml(ex.intensity) + '</span></div>';
          }

          var swapBtnHtml = canSwap
            ? '<button type="button" class="exercise-swap-btn" data-swap-index="' + idx + '" aria-label="Swap exercise">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>' +
              '</button>'
            : '';

          card.innerHTML =
            '<div class="exercise-name-row"><div class="exercise-name">' + escapeHtml(ex.exercise) + '</div>' + swapBtnHtml + '</div>' +
            '<div class="exercise-details">' + detailsHtml + '</div>' +
            (ex.notes ? '<div class="exercise-notes">' + escapeHtml(ex.notes) + '</div>' : '');
          var mainVideoBtn = addVideoButton(ex.exercise);
          if (mainVideoBtn) card.querySelector('.exercise-name-row').appendChild(mainVideoBtn);
          card.querySelector('.exercise-name-row').appendChild(addCompleteToggle(card, 'main', idx));
          mainList.appendChild(card);
        });

        if (canSwap) {
          mainList.querySelectorAll('.exercise-swap-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var index = parseInt(btn.getAttribute('data-swap-index'), 10);
              var name = btn.closest('.exercise-card').querySelector('.exercise-name').textContent;
              openSwapSheet(index, name);
            });
          });
        }
      }

      // Cooldown
      if (content.cooldown && content.cooldown.length > 0) {
        var cooldownPhase = document.getElementById('cooldownPhase');
        var cooldownList = document.getElementById('cooldownList');
        cooldownPhase.style.display = 'block';

        content.cooldown.forEach(function (ex, idx) {
          var card = document.createElement('div');
          card.className = 'exercise-card simple';
          card.innerHTML =
            '<div class="exercise-name">' + escapeHtml(ex.exercise) + '</div>' +
            (ex.duration ? '<span class="exercise-duration">' + escapeHtml(ex.duration) + '</span>' : '');
          var cooldownVideoBtn = addVideoButton(ex.exercise);
          if (cooldownVideoBtn) card.appendChild(cooldownVideoBtn);
          card.appendChild(addCompleteToggle(card, 'cooldown', idx));
          cooldownList.appendChild(card);
        });
      }
    }

    // Plan info
    if (data.workoutPlan) {
      var planInfo = document.getElementById('planInfo');
      var infoHtml = '';

      if (data.workoutPlan.name) {
        infoHtml += '<div class="plan-info-item"><span class="plan-info-label">Plan</span><span class="plan-info-value">' + escapeHtml(data.workoutPlan.name) + '</span></div>';
      }
      if (data.workoutPlan.weekNumber) {
        infoHtml += '<div class="plan-info-item"><span class="plan-info-label">Week</span><span class="plan-info-value">' + data.workoutPlan.weekNumber + '</span></div>';
      }
      if (data.workoutPlan.blockType) {
        infoHtml += '<div class="plan-info-item"><span class="plan-info-label">Block</span><span class="plan-info-value">' + escapeHtml(data.workoutPlan.blockType) + '</span></div>';
      }

      if (infoHtml) {
        planInfo.innerHTML = infoHtml;
        planInfo.style.display = 'flex';
      }
    }

    // Show complete button or completed message
    if (data.status === 'SCHEDULED') {
      document.getElementById('completeWrap').style.display = 'block';
    } else if (data.status === 'COMPLETED') {
      document.getElementById('completedMsg').style.display = 'block';
    }

    // Show content, hide loading
    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  }

  // ── Skip Modal ──
  var skipModal = document.getElementById('skipModal');
  var skipBtn = document.getElementById('skipBtn');
  var skipModalClose = document.getElementById('skipModalClose');
  var skipModalSubmit = document.getElementById('skipModalSubmit');

  skipBtn.addEventListener('click', function () {
    document.getElementById('skipReason').value = '';
    skipModal.classList.add('active');
    lockBodyScroll();
  });

  skipModalClose.addEventListener('click', function () {
    skipModal.classList.remove('active');
    unlockBodyScroll();
  });

  skipModal.addEventListener('click', function (e) {
    if (e.target === skipModal) {
      skipModal.classList.remove('active');
      unlockBodyScroll();
    }
  });

  skipModalSubmit.addEventListener('click', async function () {
    skipModalSubmit.disabled = true;
    skipModalSubmit.textContent = 'Skipping...';

    var reason = document.getElementById('skipReason').value.trim();
    var payload = { reason: reason || 'No reason provided' };

    try {
      var res = await apiPost('/api/v1/workout/' + encodeURIComponent(sessionId) + '/skip', payload);
      if (res.success) {
        skipModal.classList.remove('active');
        unlockBodyScroll();
        document.getElementById('completeWrap').style.display = 'none';
        window.location.href = '/dashboard';
      } else {
        alert('Failed to skip session: ' + (res.error || 'Unknown error'));
        skipModalSubmit.disabled = false;
        skipModalSubmit.textContent = 'Skip Session';
      }
    } catch (err) {
      alert(err.message || 'Failed to skip session.');
      skipModalSubmit.disabled = false;
      skipModalSubmit.textContent = 'Skip Session';
    }
  });

  // ── Swap Exercise Sheet ──
  var swapModal = document.getElementById('swapModal');
  var swapModalClose = document.getElementById('swapModalClose');
  var swapCurrentName = document.getElementById('swapCurrentName');
  var swapOptionsList = document.getElementById('swapOptionsList');

  function openSwapSheet(index, currentName) {
    swapCurrentName.textContent = currentName;
    swapOptionsList.innerHTML = '<div class="swap-loading">Loading alternatives...</div>';
    swapModal.classList.add('active');
    lockBodyScroll();

    apiGet('/api/v1/workout/' + encodeURIComponent(sessionId) + '/main/' + index + '/alternatives')
      .then(function (res) {
        var options = (res.success && res.data && res.data.options) || [];
        if (options.length === 0) {
          swapOptionsList.innerHTML = '<div class="swap-empty">No pre-approved alternative for this one yet — ask Jerry if you\'d like to change it.</div>';
          return;
        }
        swapOptionsList.innerHTML = '';
        options.forEach(function (opt) {
          var pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'swap-option-pill';
          pill.textContent = opt;
          pill.addEventListener('click', function () { applySwap(index, opt); });
          swapOptionsList.appendChild(pill);
        });
      })
      .catch(function () {
        swapOptionsList.innerHTML = '<div class="swap-empty">Unable to load alternatives. Try again.</div>';
      });
  }

  function applySwap(index, newExercise) {
    swapOptionsList.querySelectorAll('.swap-option-pill').forEach(function (p) { p.disabled = true; });

    apiPost('/api/v1/workout/' + encodeURIComponent(sessionId) + '/main/' + index + '/swap', { exercise: newExercise })
      .then(function (res) {
        if (res.success) {
          var nameEls = document.querySelectorAll('#mainList .exercise-name');
          if (nameEls[index]) nameEls[index].textContent = newExercise;
          swapModal.classList.remove('active');
          unlockBodyScroll();
        } else {
          alert('Failed to swap exercise: ' + (res.error || 'Unknown error'));
          swapOptionsList.querySelectorAll('.swap-option-pill').forEach(function (p) { p.disabled = false; });
        }
      })
      .catch(function (err) {
        alert(err.message || 'Failed to swap exercise.');
        swapOptionsList.querySelectorAll('.swap-option-pill').forEach(function (p) { p.disabled = false; });
      });
  }

  swapModalClose.addEventListener('click', function () {
    swapModal.classList.remove('active');
    unlockBodyScroll();
  });

  swapModal.addEventListener('click', function (e) {
    if (e.target === swapModal) {
      swapModal.classList.remove('active');
      unlockBodyScroll();
    }
  });

  // ── Completion Modal ──
  var modal = document.getElementById('completeModal');
  var completeBtn = document.getElementById('completeBtn');
  var modalClose = document.getElementById('modalClose');
  var modalSubmit = document.getElementById('modalSubmit');
  var rpeSlider = document.getElementById('rpeSlider');
  var rpeValue = document.getElementById('rpeValue');

  // RPE slider live update
  rpeSlider.addEventListener('input', function () {
    rpeValue.textContent = this.value;
  });

  // Open modal
  completeBtn.addEventListener('click', function () {
    // Pre-fill duration if we have prescribed
    if (sessionData && sessionData.prescribedDuration) {
      document.getElementById('actualDuration').value = sessionData.prescribedDuration;
    }
    modal.classList.add('active');
    lockBodyScroll();
  });

  // Close modal
  modalClose.addEventListener('click', function () {
    modal.classList.remove('active');
    unlockBodyScroll();
  });

  // Close modal on overlay click
  modal.addEventListener('click', function (e) {
    if (e.target === modal) {
      modal.classList.remove('active');
      unlockBodyScroll();
    }
  });

  // Submit completion
  modalSubmit.addEventListener('click', async function () {
    var duration = parseInt(document.getElementById('actualDuration').value, 10);
    var rpe = parseInt(rpeSlider.value, 10);
    var notes = document.getElementById('athleteNotes').value.trim();

    if (!duration || duration < 1) {
      alert('Please enter the workout duration in minutes.');
      return;
    }

    if (duration > 600) {
      alert('Duration cannot exceed 600 minutes.');
      return;
    }

    modalSubmit.disabled = true;
    modalSubmit.textContent = 'Submitting...';

    var payload = {
      actualDuration: duration,
      rpe: rpe
    };
    if (notes) {
      payload.athleteNotes = notes;
    }

    try {
      var res = await apiPost('/api/v1/workout/' + sessionId + '/complete', payload);

      if (res.success) {
        modal.classList.remove('active');
        unlockBodyScroll();

        // Hide complete button, show success
        document.getElementById('completeWrap').style.display = 'none';
        document.getElementById('completedMsg').style.display = 'block';

        // Update status badge
        var metaEl = document.getElementById('workoutMeta');
        var badges = metaEl.querySelectorAll('.workout-badge');
        if (badges.length > 0) {
          badges[badges.length - 1].textContent = 'COMPLETED';
        }

        // Redirect to dashboard after brief delay
        setTimeout(function () {
          window.location.href = '/dashboard';
        }, 2000);
      } else {
        alert('Failed to mark workout as complete. Please try again.');
        modalSubmit.disabled = false;
        modalSubmit.textContent = 'Submit';
      }
    } catch (err) {
      alert(err.message || 'Failed to complete workout.');
      modalSubmit.disabled = false;
      modalSubmit.textContent = 'Submit';
    }
  });

  // ── Helpers ──
  function showError(msg) {
    loadingEl.style.display = 'none';
    errorMsg.textContent = msg;
    errorEl.style.display = 'block';
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Rounds odd rest values (e.g. "51s", "64s") to the nearest clean interval
  // for display. Older plans generated before this fix can still have
  // arbitrary numbers baked into their stored content.
  var CLEAN_REST_SECONDS = [30, 45, 60, 90, 120];
  function normalizeRest(rest) {
    if (!rest) return rest;
    var match = /^(\d+)\s*s(ec(onds?)?)?$/i.exec(rest.trim());
    if (!match) return rest;
    var seconds = parseInt(match[1], 10);
    var closest = CLEAN_REST_SECONDS[0];
    CLEAN_REST_SECONDS.forEach(function (candidate) {
      if (Math.abs(candidate - seconds) < Math.abs(closest - seconds)) closest = candidate;
    });
    return closest + 's';
  }

  var CHECK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

  function addCompleteToggle(card, section, index) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'exercise-complete-btn';
    btn.setAttribute('aria-label', 'Mark exercise complete');
    btn.innerHTML = CHECK_ICON;

    var savedIndices = (sessionData && sessionData.completedExercises && sessionData.completedExercises[section]) || [];
    if (savedIndices.indexOf(index) !== -1) {
      card.classList.add('exercise-checked');
      btn.classList.add('checked');
    }

    btn.addEventListener('click', function () {
      var isChecked = card.classList.toggle('exercise-checked');
      btn.classList.toggle('checked', isChecked);
      btn.disabled = true;

      apiPost('/api/v1/workout/' + encodeURIComponent(sessionId) + '/exercise-toggle', {
        section: section,
        index: index,
        completed: isChecked
      }).then(function (res) {
        if (res.success && res.data) {
          sessionData.completedExercises = res.data;
        }
      }).catch(function () {
        // Revert on failure so the UI never claims a save that didn't happen
        card.classList.toggle('exercise-checked');
        btn.classList.toggle('checked');
      }).finally(function () {
        btn.disabled = false;
      });
    });
    return btn;
  }

  // ── Show Me How (exercise demo video) ──
  var PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
  var videoModal = document.getElementById('videoModal');
  var videoModalClose = document.getElementById('videoModalClose');
  var videoModalTitle = document.getElementById('videoModalTitle');
  var videoModalPlayer = document.getElementById('videoModalPlayer');

  function openVideoModal(exerciseName, videoUrl) {
    videoModalTitle.textContent = exerciseName;
    videoModalPlayer.src = videoUrl;
    videoModal.classList.add('active');
    lockBodyScroll();
    videoModalPlayer.play().catch(function () {});
  }

  function closeVideoModal() {
    videoModal.classList.remove('active');
    unlockBodyScroll();
    videoModalPlayer.pause();
    videoModalPlayer.removeAttribute('src');
    videoModalPlayer.load();
  }

  videoModalClose.addEventListener('click', closeVideoModal);
  videoModal.addEventListener('click', function (e) {
    if (e.target === videoModal) closeVideoModal();
  });

  // Returns a "Show me how" button if an approved demo exists for this
  // exercise, or null if not — callers should skip appending in that case.
  function addVideoButton(exerciseName) {
    var videoUrl = approvedVideoMap[exerciseName] || approvedVideoMapLower[(exerciseName || '').toLowerCase()];
    if (!videoUrl) return null;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'exercise-video-btn';
    btn.innerHTML = PLAY_ICON + '<span>Show me how</span>';
    btn.addEventListener('click', function () {
      openVideoModal(exerciseName, videoUrl);
    });
    return btn;
  }
})();

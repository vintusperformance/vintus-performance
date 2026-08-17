/**
 * Vintus Performance — Training Calendar
 * Full calendar week view with drag-drop, mobile move, and auto-replan.
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

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Calendar state
  var currentWeekOffset = 0;
  var weekSessions = [];
  var draggedSessionId = null;
  var isMobile = window.innerWidth <= 768;

  // ── Timezone-safe date helper ──
  function toLocalDateStr(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  // Parses a "YYYY-MM-DD..." date string into a local-midnight Date using
  // the numeric constructor (not `new Date(isoString)`), so a UTC-midnight
  // timestamp from the API never shifts a day backward for timezones west
  // of UTC. Same convention as toLocalDateStr, just inverted.
  function parseDateOnly(dateStr) {
    var parts = dateStr.substring(0, 10).split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  // ── Full Plan view state ──
  var fullPlanLoaded = false;

  // ── Load initial data ──
  var initialView = new URLSearchParams(window.location.search).get('view');
  if (initialView === 'full') {
    switchView('full');
  } else {
    loadWeek(0);
  }

  // ── Resize handler for mobile detection ──
  window.addEventListener('resize', function () {
    var wasMobile = isMobile;
    isMobile = window.innerWidth <= 768;
    if (wasMobile !== isMobile) renderCalendar();
  });

  // ── Load week data ──
  async function loadWeek(offset) {
    if (typeof offset === 'number') currentWeekOffset = offset;

    var monday = getWeekMonday(currentWeekOffset);
    var sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    var titleEl = document.getElementById('calTitle');

    if (currentWeekOffset === 0) {
      titleEl.textContent = 'This Week';
    } else if (currentWeekOffset === -1) {
      titleEl.textContent = 'Last Week';
    } else if (currentWeekOffset === 1) {
      titleEl.textContent = 'Next Week';
    } else {
      titleEl.textContent = formatShortDate(monday) + ' \u2013 ' + formatShortDate(sunday);
    }

    try {
      var res = await apiGet('/api/v1/dashboard/week/' + currentWeekOffset);
      if (res.success && res.data) {
        weekSessions = res.data.sessions || [];
      } else {
        weekSessions = [];
      }

      var adhEl = document.getElementById('calAdherence');
      var adhRate = res.data && res.data.adherenceRate;
      if (adhRate != null && weekSessions.length > 0) {
        adhEl.textContent = Math.round(adhRate * 100) + '% adherence this week';
      } else {
        adhEl.textContent = '';
      }
    } catch (err) {
      console.error('Failed to load week data:', err);
      weekSessions = [];
      document.getElementById('calAdherence').textContent = '';
    }

    try {
      renderCalendar();
    } catch (renderErr) {
      console.error('Calendar render error:', renderErr);
      document.getElementById('calGrid').innerHTML =
        '<div style="padding:1rem;color:#f87171;font-size:0.85rem;">Calendar failed to render. Please hard-refresh (Ctrl+Shift+R).</div>';
    }
  }

  function getWeekMonday(offset) {
    var d = new Date(today);
    var dayOfWeek = d.getDay();
    var diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    d.setDate(d.getDate() - diff + (offset * 7));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function renderCalendar() {
    var grid = document.getElementById('calGrid');
    grid.innerHTML = '';

    var monday = getWeekMonday(currentWeekOffset);
    var todayStr = toLocalDateStr(today);

    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(d.getDate() + i);
      var dateStr = toLocalDateStr(d);
      var isPast = dateStr < todayStr;
      var isToday = dateStr === todayStr;

      var daySessions = weekSessions.filter(function (s) {
        return s.scheduledDate && s.scheduledDate.substring(0, 10) === dateStr;
      });

      var dayEl = document.createElement('div');
      dayEl.className = 'cal-day' + (isToday ? ' cal-day--today' : '') + (isPast ? ' cal-day--past' : '');
      dayEl.setAttribute('data-date', dateStr);

      var header = document.createElement('div');
      header.className = 'cal-day-header';
      header.innerHTML =
        '<span class="cal-day-name">' + DAY_NAMES[d.getDay()] + '</span>' +
        '<span class="cal-day-num">' + d.getDate() + '</span>';
      dayEl.appendChild(header);

      var body = document.createElement('div');
      body.className = 'cal-day-body';

      if (daySessions.length === 0) {
        var restLabel = document.createElement('span');
        restLabel.className = 'cal-rest-label';
        restLabel.textContent = 'Rest';
        body.appendChild(restLabel);
      } else {
        daySessions.forEach(function (session) {
          body.appendChild(buildWorkoutCard(session, isPast));
        });
      }

      dayEl.appendChild(body);

      if (!isMobile) {
        dayEl.addEventListener('dragover', handleDragOver);
        dayEl.addEventListener('dragleave', handleDragLeave);
        dayEl.addEventListener('drop', handleDrop);
      }

      grid.appendChild(dayEl);
    }
  }

  function buildWorkoutCard(session, isPast, opts) {
    var interactive = !opts || opts.interactive !== false;
    var statusClass = getStatusClass(session.status);
    var typeBadge = (session.sessionType || '').replace(/_/g, ' ');
    var duration = session.prescribedDuration ? session.prescribedDuration + ' min' : '';
    var statusIcon = getStatusIcon(session.status);

    var isMissedVisually = session.status === 'SCHEDULED' && isPast;
    if (isMissedVisually) {
      statusClass = 'missed';
      statusIcon = '\u2717';
    }

    var isDraggable = interactive && session.status === 'SCHEDULED' && !isPast;

    var card = document.createElement('div');
    card.className = 'cal-workout cal-workout--' + statusClass;
    card.setAttribute('data-session-id', session.id);

    if (isDraggable && !isMobile) {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragend', handleDragEnd);
    }

    card.innerHTML =
      '<div class="cal-workout-type">' + escapeHtml(typeBadge) + '</div>' +
      '<div class="cal-workout-title">' + escapeHtml(session.title) + '</div>' +
      '<div class="cal-workout-meta">' +
        '<span>' + duration + '</span>' +
        '<span class="cal-workout-status">' + statusIcon + '</span>' +
      '</div>';

    card.addEventListener('click', function (e) {
      if (e.defaultPrevented) return;
      window.location.href = '/workout?id=' + session.id;
    });

    if (isMobile && isDraggable) {
      var longPressTimer;
      card.addEventListener('touchstart', function (e) {
        longPressTimer = setTimeout(function () {
          e.preventDefault();
          openMoveModal(session.id);
        }, 500);
      }, { passive: false });
      card.addEventListener('touchend', function () { clearTimeout(longPressTimer); });
      card.addEventListener('touchmove', function () { clearTimeout(longPressTimer); });
    }

    if (isMissedVisually) {
      var replanBtn = document.createElement('button');
      replanBtn.className = 'cal-workout-replan';
      replanBtn.textContent = 'Auto-Replan';
      replanBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        triggerReplan(session.id);
      });
      card.appendChild(replanBtn);
    }

    return card;
  }

  // ── Drag-and-Drop (Desktop) ──

  function handleDragStart(e) {
    draggedSessionId = this.getAttribute('data-session-id');
    this.classList.add('cal-workout--dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedSessionId);
  }

  function handleDragEnd() {
    this.classList.remove('cal-workout--dragging');
    draggedSessionId = null;
    document.querySelectorAll('.cal-day--dragover').forEach(function (el) {
      el.classList.remove('cal-day--dragover');
    });
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var dayEl = e.target.closest('.cal-day');
    if (dayEl && !dayEl.classList.contains('cal-day--dragover')) {
      document.querySelectorAll('.cal-day--dragover').forEach(function (el) {
        el.classList.remove('cal-day--dragover');
      });
      dayEl.classList.add('cal-day--dragover');
    }
  }

  function handleDragLeave(e) {
    var dayEl = e.target.closest('.cal-day');
    if (dayEl && !dayEl.contains(e.relatedTarget)) {
      dayEl.classList.remove('cal-day--dragover');
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    var dayEl = e.target.closest('.cal-day');
    if (!dayEl) return;
    dayEl.classList.remove('cal-day--dragover');

    var sessionId = e.dataTransfer.getData('text/plain');
    var newDate = dayEl.getAttribute('data-date');
    var todayStr = toLocalDateStr(today);

    if (!sessionId || !newDate) return;

    if (newDate < todayStr) {
      showToast('Cannot move a workout to a past date.');
      return;
    }

    rescheduleSession(sessionId, newDate);
  }

  // ── API Calls ──

  async function rescheduleSession(sessionId, newDate) {
    try {
      var res = await apiPost('/api/v1/workout/' + sessionId + '/reschedule', {
        newDate: newDate
      });
      if (res.success) {
        showToast('Workout rescheduled.');
        loadWeek(currentWeekOffset);
      } else {
        showToast(res.error || 'Reschedule failed.');
      }
    } catch (err) {
      showToast(err.message || 'Reschedule failed.');
    }
  }

  async function triggerReplan(sessionId) {
    if (!confirm('This will mark this workout as missed and auto-adjust your remaining plan. Continue?')) {
      return;
    }
    try {
      var res = await apiPost('/api/v1/workout/' + sessionId + '/replan');
      if (res.success) {
        showToast('Plan adjusted for missed workout.');
        var inFullPlanView = document.getElementById('calFullPlanCard').style.display !== 'none';
        if (inFullPlanView) {
          fullPlanLoaded = false;
          loadFullPlan();
        } else if (res.data && res.data.sessions) {
          weekSessions = res.data.sessions;
          renderCalendar();
        } else {
          loadWeek(currentWeekOffset);
        }
      } else {
        showToast(res.error || 'Replan failed.');
      }
    } catch (err) {
      showToast(err.message || 'Replan failed.');
    }
  }

  // ── Mobile Move Modal ──

  function openMoveModal(sessionId) {
    var modal = document.getElementById('calMoveModal');
    var daysContainer = document.getElementById('calMoveDays');
    daysContainer.innerHTML = '';

    var monday = getWeekMonday(currentWeekOffset);
    var todayStr = toLocalDateStr(today);

    for (var i = 0; i < 7; i++) {
      var d = new Date(monday);
      d.setDate(d.getDate() + i);
      var dateStr = toLocalDateStr(d);
      var isPastDay = dateStr < todayStr;

      var btn = document.createElement('button');
      btn.className = 'cal-move-day-btn';
      btn.textContent = DAY_NAMES[d.getDay()] + '\n' + d.getDate();
      btn.style.whiteSpace = 'pre-line';
      btn.setAttribute('data-date', dateStr);
      btn.disabled = isPastDay;

      btn.addEventListener('click', function () {
        var targetDate = this.getAttribute('data-date');
        modal.style.display = 'none';
        unlockBodyScroll();
        rescheduleSession(sessionId, targetDate);
      });

      daysContainer.appendChild(btn);
    }

    modal.style.display = 'flex';
    lockBodyScroll();
  }

  document.getElementById('calMoveCancel').addEventListener('click', function () {
    document.getElementById('calMoveModal').style.display = 'none';
    unlockBodyScroll();
  });

  // ── Week Navigation ──

  document.getElementById('calPrev').addEventListener('click', function () {
    if (currentWeekOffset > -52) loadWeek(currentWeekOffset - 1);
  });

  document.getElementById('calNext').addEventListener('click', function () {
    // 12 weeks ahead covers a full 90-day Training plan generated upfront at
    // purchase -- keep in sync with dashboard.routes.ts's matching cap.
    if (currentWeekOffset < 12) loadWeek(currentWeekOffset + 1);
  });

  // ── View toggle: This Week vs. Full Plan ──

  document.getElementById('calViewWeekBtn').addEventListener('click', function () { switchView('week'); });
  document.getElementById('calViewFullBtn').addEventListener('click', function () { switchView('full'); });

  function switchView(view) {
    var weekBtn = document.getElementById('calViewWeekBtn');
    var fullBtn = document.getElementById('calViewFullBtn');
    var weekCard = document.getElementById('calWeekCard');
    var fullCard = document.getElementById('calFullPlanCard');

    if (view === 'full') {
      weekBtn.classList.remove('cal-view-toggle__btn--active');
      fullBtn.classList.add('cal-view-toggle__btn--active');
      weekCard.style.display = 'none';
      fullCard.style.display = 'block';
      if (!fullPlanLoaded) loadFullPlan();
    } else {
      fullBtn.classList.remove('cal-view-toggle__btn--active');
      weekBtn.classList.add('cal-view-toggle__btn--active');
      fullCard.style.display = 'none';
      weekCard.style.display = 'block';
    }
  }

  // ── Full Plan: every day, start date to expiration, in one view ──

  async function loadFullPlan() {
    var body = document.getElementById('calFullPlanBody');
    var rangeEl = document.getElementById('calFullPlanRange');
    var adhEl = document.getElementById('calFullPlanAdherence');

    try {
      var res = await apiGet('/api/v1/dashboard/full-plan');
      var data = res.success ? res.data : null;

      if (!data || !data.available) {
        rangeEl.textContent = '';
        adhEl.textContent = '';
        body.innerHTML = '<p class="cal-full-plan__unavailable">No plan generated yet — check back soon.</p>';
        fullPlanLoaded = true;
        return;
      }

      fullPlanLoaded = true;
      var startD = parseDateOnly(data.startDate);
      var endD = parseDateOnly(data.endDate);
      var weekCount = data.weeks.length;
      rangeEl.textContent = formatLongDate(startD) + ' – ' + formatLongDate(endD) + (data.isOpenEnded ? ' so far' : '') + ' (' + weekCount + (weekCount === 1 ? ' week' : ' weeks') + ')';
      adhEl.textContent = data.totalSessions > 0
        ? Math.round(data.adherenceRate * 100) + '% adherence overall · ' + data.completedCount + ' of ' + data.totalSessions + ' sessions completed'
        : '';

      body.innerHTML = '';
      data.weeks.forEach(function (week) {
        body.appendChild(renderFullPlanWeek(week));
      });
    } catch (err) {
      console.error('Failed to load full plan:', err);
      body.innerHTML = '<p class="cal-full-plan__unavailable">Couldn\'t load your full plan. Please try again.</p>';
    }
  }

  function renderFullPlanWeek(week) {
    var weekWrap = document.createElement('div');
    weekWrap.className = 'cal-full-plan__week';

    var startD = parseDateOnly(week.startDate);
    var endD = parseDateOnly(week.endDate);

    var header = document.createElement('div');
    header.className = 'cal-full-plan__week-header';
    header.textContent = 'Week ' + week.weekNumber + '  ·  ' + formatShortDate(startD) + ' – ' + formatShortDate(endD);
    weekWrap.appendChild(header);

    var grid = document.createElement('div');
    grid.className = 'cal-grid';
    var todayStr = toLocalDateStr(today);

    for (var i = 0; i < 7; i++) {
      var d = new Date(startD);
      d.setDate(d.getDate() + i);
      var dateStr = toLocalDateStr(d);
      var isPast = dateStr < todayStr;
      var isToday = dateStr === todayStr;

      var daySessions = week.sessions.filter(function (s) {
        return s.scheduledDate && s.scheduledDate.substring(0, 10) === dateStr;
      });

      var dayEl = document.createElement('div');
      dayEl.className = 'cal-day' + (isToday ? ' cal-day--today' : '') + (isPast ? ' cal-day--past' : '');
      dayEl.setAttribute('data-date', dateStr);

      var dayHeader = document.createElement('div');
      dayHeader.className = 'cal-day-header';
      dayHeader.innerHTML =
        '<span class="cal-day-name">' + DAY_NAMES[d.getDay()] + '</span>' +
        '<span class="cal-day-num">' + d.getDate() + '</span>';
      dayEl.appendChild(dayHeader);

      var dayBody = document.createElement('div');
      dayBody.className = 'cal-day-body';

      if (daySessions.length === 0) {
        var restLabel = document.createElement('span');
        restLabel.className = 'cal-rest-label';
        restLabel.textContent = 'Rest';
        dayBody.appendChild(restLabel);
      } else {
        daySessions.forEach(function (session) {
          dayBody.appendChild(buildWorkoutCard(session, isPast, { interactive: false }));
        });
      }

      dayEl.appendChild(dayBody);
      grid.appendChild(dayEl);
    }

    weekWrap.appendChild(grid);
    return weekWrap;
  }

  function formatLongDate(d) {
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  // ── Helpers ──

  function getStatusClass(status) {
    switch (status) {
      case 'COMPLETED': return 'completed';
      case 'MISSED': return 'missed';
      case 'SKIPPED': return 'skipped';
      case 'RESCHEDULED': return 'rescheduled';
      default: return 'scheduled';
    }
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'COMPLETED': return '\u2713';
      case 'MISSED': return '\u2717';
      case 'SKIPPED': return 'S';
      default: return '\u2022';
    }
  }

  function formatShortDate(d) {
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function showToast(msg) {
    var existing = document.querySelector('.cal-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'cal-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(function () { toast.remove(); }, 3000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();

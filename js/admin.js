/**
 * Vintus Performance — Admin Dashboard Logic
 */

(function () {
  /* ── Auth Guard ── */
  var role = localStorage.getItem('vintus_role');
  if (!isLoggedIn() || role !== 'ADMIN') {
    window.location.href = '/login';
    return;
  }

  /* ── State ── */
  var loadedTabs = { command: false, overview: false, actions: false, clients: false, messaging: false, adherence: false, escalations: false, upcomingCalls: false, crm: false, exerciseVideos: false };
  var clientsPage = 1;
  var clientsTotalPages = 1;
  var escalationsPage = 1;
  var escalationsTotalPages = 1;
  var escalationFilter = 'all';
  var crmPage = 1;
  var crmTotalPages = 1;
  var videoFilter = 'all';
  var currentDetailUserId = null;
  var searchTimeout = null;

  /* ── Utilities ── */
  function esc(str) {
    if (!str && str !== 0) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtDateTime(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function timeAgo(dateStr) {
    if (!dateStr) return 'Never';
    var diff = Date.now() - new Date(dateStr).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    return days + 'd ago';
  }

  function fmtCurrency(amount) {
    return '$' + Number(amount).toLocaleString();
  }

  function fmtPct(val) {
    if (val == null) return '—';
    return Math.round(val * 100) + '%';
  }

  function fmtTier(tier) {
    if (!tier) return '—';
    return tier.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function profileOption(value, label, current) {
    var selected = (current && current.toLowerCase() === value.toLowerCase()) ? ' selected' : '';
    return '<option value="' + esc(value) + '"' + selected + '>' + esc(label) + '</option>';
  }

  function statusBadge(status) {
    if (!status) return '<span class="admin-badge">—</span>';
    var cls = 'admin-badge';
    var s = status.toLowerCase().replace(/_/g, '-');
    if (s === 'active' || s === 'completed') cls += ' admin-badge--active';
    else if (s === 'canceled' || s === 'missed') cls += ' admin-badge--canceled';
    else if (s === 'past-due' || s === 'skipped') cls += ' admin-badge--past-due';
    else if (s === 'scheduled') cls += ' admin-badge--scheduled';
    else if (s === 'pending-approval') cls += ' admin-badge--pending-approval';
    return '<span class="' + cls + '">' + esc(status) + '</span>';
  }

  function debounce(fn, delay) {
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  /* ── Tab Navigation ── */
  var tabs = document.querySelectorAll('.admin-tab');
  var tabContents = document.querySelectorAll('.admin-tab-content');

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.getAttribute('data-tab');
      tabs.forEach(function (t) { t.classList.remove('admin-tab--active'); });
      tab.classList.add('admin-tab--active');
      tabContents.forEach(function (tc) { tc.classList.remove('admin-tab-content--active'); });
      var el = document.getElementById('tab' + target.charAt(0).toUpperCase() + target.slice(1));
      if (el) el.classList.add('admin-tab-content--active');
      loadTab(target);
    });
  });

  function showTabLoading(name) {
    var shimmerHtml = '<div class="admin-loading" style="height:40px;margin-bottom:0.75rem;"></div>' +
      '<div class="admin-loading" style="height:40px;margin-bottom:0.75rem;"></div>' +
      '<div class="admin-loading" style="height:40px;margin-bottom:0.75rem;"></div>';
    if (name === 'actions') {
      var tEl = document.getElementById('aqTriggers');
      var paEl = document.getElementById('aqPendingApprovals');
      if (tEl && !tEl.innerHTML.trim()) tEl.innerHTML = shimmerHtml;
      if (paEl && !paEl.innerHTML.trim()) paEl.innerHTML = shimmerHtml;
    } else if (name === 'escalations') {
      var listEl = document.getElementById('escalationsList');
      if (listEl && !listEl.innerHTML.trim()) listEl.innerHTML = shimmerHtml;
    } else if (name === 'messaging') {
      var msgBody = document.getElementById('msgBody');
      if (msgBody && !msgBody.innerHTML.trim()) {
        msgBody.innerHTML = '<tr><td colspan="6"><div class="admin-loading" style="height:24px;margin:0.5rem 0;"></div><div class="admin-loading" style="height:24px;margin:0.5rem 0;"></div></td></tr>';
      }
    } else if (name === 'adherence') {
      var adhBody = document.getElementById('adherenceBody');
      if (adhBody && !adhBody.innerHTML.trim()) {
        adhBody.innerHTML = '<tr><td colspan="6"><div class="admin-loading" style="height:24px;margin:0.5rem 0;"></div><div class="admin-loading" style="height:24px;margin:0.5rem 0;"></div></td></tr>';
      }
    }
  }

  function loadTab(name, force) {
    if (loadedTabs[name] && !force) return;
    showTabLoading(name);
    loadedTabs[name] = true;
    if (name === 'command') loadCommand();
    else if (name === 'overview') loadOverview();
    else if (name === 'actions') loadActionQueue();
    else if (name === 'clients') loadClients();
    else if (name === 'messaging') loadMessaging();
    else if (name === 'adherence') loadAdherence();
    else if (name === 'escalations') loadEscalations();
    else if (name === 'upcomingCalls') loadUpcomingCalls();
    else if (name === 'crm') loadCrm();
    else if (name === 'exerciseVideos') loadExerciseVideos();
  }

  /* ── Refresh Button ── */
  document.getElementById('refreshBtn').addEventListener('click', function () {
    var active = document.querySelector('.admin-tab--active');
    if (active) loadTab(active.getAttribute('data-tab'), true);
  });

  /* ── Logout ── */
  document.getElementById('adminLogoutBtn').addEventListener('click', async function () {
    try { await apiPost('/api/v1/auth/logout'); } catch (e) { /* ignore */ }
    clearToken();
    localStorage.removeItem('vintus_role');
    window.location.href = '/login';
  });

  /* ============================================================
     OVERVIEW TAB
     ============================================================ */

  function renderFeatureFlags(flags) {
    var el = document.getElementById('featureFlags');
    if (!el) return;

    var items = [
      { key: 'messagingEnabled', label: 'SMS & Email Delivery', desc: 'When OFF, all messages are logged but not actually sent' },
      { key: 'cronEnabled', label: 'Automated Cron Jobs', desc: 'Daily reviews, workout alerts, weekly digests' },
      { key: 'autoMessagingEnabled', label: 'Auto-Send Messages', desc: 'When OFF, cron queues triggers for manual review' },
    ];

    var html = '';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var isOn = flags[item.key] === true;
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid rgba(192,192,192,0.08);">' +
        '<div>' +
          '<div style="color:#c0c0c0;font-size:0.85rem;font-weight:500;">' + esc(item.label) + '</div>' +
          '<div style="color:rgba(192,192,192,0.35);font-size:0.7rem;">' + esc(item.desc) + '</div>' +
        '</div>' +
        '<button class="flag-toggle" data-flag="' + item.key + '" data-value="' + (isOn ? 'true' : 'false') + '" ' +
          'style="min-width:56px;padding:0.35rem 0.7rem;font-size:0.75rem;font-weight:600;border:1px solid;cursor:pointer;' +
          (isOn ? 'background:rgba(74,222,128,0.15);border-color:rgba(74,222,128,0.4);color:#4ade80;' : 'background:rgba(248,113,113,0.1);border-color:rgba(248,113,113,0.3);color:#f87171;') +
          '">' + (isOn ? 'ON' : 'OFF') + '</button>' +
      '</div>';
    }
    el.innerHTML = html;

    // Bind toggle clicks
    el.querySelectorAll('.flag-toggle').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var flag = btn.getAttribute('data-flag');
        var currentlyOn = btn.getAttribute('data-value') === 'true';
        var newValue = !currentlyOn;
        var label = btn.closest('div').querySelector('div').textContent;
        if (!confirm((newValue ? 'Enable' : 'Disable') + ' ' + label + '?')) return;
        btn.disabled = true;
        btn.textContent = '...';
        try {
          var res = await apiPut('/api/v1/admin/feature-flags', { flag: flag, value: newValue });
          if (res.success) {
            renderFeatureFlags(res.data);
          }
        } catch (err) {
          alert('Failed: ' + err.message);
        }
        btn.disabled = false;
      });
    });
  }

  /* ── Command Center ── */

  function goToTab(name) {
    var btn = document.querySelector('.admin-tab[data-tab="' + name + '"]');
    if (btn) btn.click();
  }

  async function loadCommand() {
    try {
      var results = await Promise.all([
        apiGet('/api/v1/admin/analytics/overview'),
        apiGet('/api/v1/admin/action-queue'),
        apiGet('/api/v1/admin/system/health'),
        apiGet('/api/v1/admin/triggers')
      ]);

      var overview = results[0].data;
      var queue = results[1].data;
      var health = results[2].data;
      var triggers = (results[3].data && results[3].data.triggers) || [];

      var pendingApprovals = queue.pendingApprovals || [];
      var escalations = queue.unresolvedEscalations || [];
      var completedPlans = queue.completedPlans || [];
      var endingSoon = queue.endingSoon || [];

      var downServices = Object.keys(health).filter(function (k) {
        return health[k] && health[k].status !== 'ok';
      });

      // ── Priority list, ranked by cost of delay ──
      var items = [];

      if (pendingApprovals.length) {
        items.push({
          sev: 'critical',
          title: pendingApprovals.length + ' client' + (pendingApprovals.length === 1 ? '' : 's') + ' awaiting approval',
          detail: 'Paid and waiting. Their plan stays locked until you approve.',
          action: 'Review', tab: 'clients'
        });
      }

      if (downServices.length) {
        items.push({
          sev: 'critical',
          title: downServices.join(', ') + ' not responding',
          detail: 'A core service is failing health checks.',
          action: 'Diagnose', tab: 'overview'
        });
      }

      if (completedPlans.length) {
        var soonest = null;
        for (var c = 0; c < completedPlans.length; c++) {
          var d = completedPlans[c].daysUntilDelete;
          if (d != null && (soonest === null || d < soonest)) soonest = d;
        }
        items.push({
          sev: 'warn',
          title: completedPlans.length + ' plan' + (completedPlans.length === 1 ? '' : 's') + ' completed, awaiting renewal',
          detail: soonest != null
            ? 'Auto-deactivates in ' + soonest + ' day' + (soonest === 1 ? '' : 's') + ' without a response.'
            : 'Renewal response outstanding.',
          action: 'Open', tab: 'actions'
        });
      }

      if (escalations.length) {
        items.push({
          sev: 'warn',
          title: escalations.length + ' unresolved escalation' + (escalations.length === 1 ? '' : 's'),
          detail: 'Clients falling behind who have already been flagged.',
          action: 'Review', tab: 'escalations'
        });
      }

      if (triggers.length) {
        items.push({
          sev: 'info',
          title: triggers.length + ' message' + (triggers.length === 1 ? '' : 's') + ' queued for send',
          detail: 'Auto-messaging is off, so these wait on your approval.',
          action: 'Open', tab: 'actions'
        });
      }

      if (endingSoon.length) {
        items.push({
          sev: 'info',
          title: endingSoon.length + ' plan' + (endingSoon.length === 1 ? '' : 's') + ' ending within 7 days',
          detail: 'Renewal conversations worth having now.',
          action: 'Open', tab: 'actions'
        });
      }

      // ── Headline ──
      // Counts decisions only. Queued messages are a bulk queue, not individual
      // judgment calls — folding them in produces an alarming, meaningless number.
      var actionable = pendingApprovals.length + escalations.length + completedPlans.length;
      var statusEl = document.getElementById('ccStatus');
      var subEl = document.getElementById('ccStatusSub');
      var headEl = document.getElementById('ccHeadline');

      headEl.classList.remove('cc-headline--clear', 'cc-headline--warn', 'cc-headline--critical');

      if (downServices.length || pendingApprovals.length) {
        headEl.classList.add('cc-headline--critical');
        statusEl.textContent = actionable + ' item' + (actionable === 1 ? '' : 's') + ' need you';
        subEl.textContent = pendingApprovals.length
          ? 'Someone paid and is waiting on activation.'
          : 'A core service is down.';
      } else if (actionable > 0) {
        headEl.classList.add('cc-headline--warn');
        statusEl.textContent = actionable + ' item' + (actionable === 1 ? '' : 's') + ' need you';
        subEl.textContent = 'Nothing urgent. Worth clearing today.';
      } else if (triggers.length) {
        headEl.classList.add('cc-headline--clear');
        statusEl.textContent = 'All clear';
        subEl.textContent = 'No decisions waiting. ' + triggers.length + ' message' +
          (triggers.length === 1 ? '' : 's') + ' queued for send when you want them.';
      } else {
        headEl.classList.add('cc-headline--clear');
        statusEl.textContent = 'All clear';
        subEl.textContent = 'Nothing is waiting on you. Everything is running clean.';
      }

      // ── Render priority list ──
      var pEl = document.getElementById('ccPriority');
      if (!items.length) {
        pEl.innerHTML = '<div class="admin-empty">Nothing needs your attention right now.</div>';
      } else {
        var pHtml = '';
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          pHtml += '<div class="cc-item cc-item--' + it.sev + '">' +
            '<span class="cc-item-dot"></span>' +
            '<div class="cc-item-body">' +
              '<div class="cc-item-title">' + esc(it.title) + '</div>' +
              '<div class="cc-item-detail">' + esc(it.detail) + '</div>' +
            '</div>' +
            '<button class="cc-item-btn" data-goto="' + esc(it.tab) + '">' + esc(it.action) + '</button>' +
          '</div>';
        }
        pEl.innerHTML = pHtml;
        pEl.querySelectorAll('[data-goto]').forEach(function (btn) {
          btn.addEventListener('click', function () { goToTab(btn.getAttribute('data-goto')); });
        });
      }

      // ── Metrics ──
      document.getElementById('ccMrr').textContent = fmtCurrency(overview.mrr);
      document.getElementById('ccActive').textContent = overview.activeClients;
      document.getElementById('ccActiveNote').textContent = overview.totalClients + ' total';
      document.getElementById('ccAdherence').textContent = fmtPct(overview.avgAdherenceRate);

      var net = (overview.newLast30Days || 0) - (overview.churnedLast30Days || 0);
      var netEl = document.getElementById('ccNet');
      netEl.textContent = (net > 0 ? '+' : '') + net;
      netEl.className = 'cc-metric-value' + (net > 0 ? ' cc-pos' : net < 0 ? ' cc-neg' : '');
      document.getElementById('ccNetNote').textContent =
        (overview.newLast30Days || 0) + ' new · ' + (overview.churnedLast30Days || 0) + ' churned';

      // ── System row ──
      var sysHtml = '';
      var svcKeys = Object.keys(health);
      for (var s = 0; s < svcKeys.length; s++) {
        var name = svcKeys[s];
        var ok = health[name] && health[name].status === 'ok';
        sysHtml += '<div class="cc-svc">' +
          '<span class="cc-svc-dot ' + (ok ? 'cc-svc-dot--ok' : 'cc-svc-dot--down') + '"></span>' +
          '<span class="cc-svc-name">' + esc(name) + '</span>' +
        '</div>';
      }
      document.getElementById('ccSystem').innerHTML = sysHtml ||
        '<div class="admin-empty">No health data.</div>';

    } catch (e) {
      document.getElementById('ccStatus').textContent = 'Unable to load';
      document.getElementById('ccStatusSub').textContent = e.message || 'Something went wrong reaching the server.';
      document.getElementById('ccPriority').innerHTML =
        '<div class="admin-empty">Could not reach the admin API.</div>';
    }
  }

  async function loadOverview() {
    try {
      var results = await Promise.all([
        apiGet('/api/v1/admin/analytics/overview'),
        apiGet('/api/v1/admin/system/health'),
        apiGet('/api/v1/admin/system/cron-status'),
        apiGet('/api/v1/admin/feature-flags')
      ]);

      var overview = results[0].data;
      var health = results[1].data;
      var cron = results[2].data;

      // KPIs
      document.getElementById('kpiTotal').textContent = overview.totalClients;
      document.getElementById('kpiActive').textContent = overview.activeClients;
      document.getElementById('kpiAdherence').textContent = fmtPct(overview.avgAdherenceRate);
      document.getElementById('kpiMrr').textContent = fmtCurrency(overview.mrr);
      document.getElementById('kpiNew').textContent = overview.newLast30Days;
      document.getElementById('kpiChurned').textContent = overview.churnedLast30Days;

      // Tier breakdown
      var tierEl = document.getElementById('tierBreakdown');
      var maxTier = Math.max(1, Math.max.apply(null, Object.values(overview.byTier)));
      var tierHtml = '';
      var tierKeys = Object.keys(overview.byTier);
      for (var i = 0; i < tierKeys.length; i++) {
        var k = tierKeys[i];
        var v = overview.byTier[k];
        var pct = Math.round((v / maxTier) * 100);
        tierHtml += '<div class="admin-tier-row">' +
          '<span class="admin-tier-label">' + esc(fmtTier(k)) + '</span>' +
          '<div class="admin-tier-bar-bg"><div class="admin-tier-bar" style="width:' + pct + '%"></div></div>' +
          '<span class="admin-tier-count">' + v + '</span>' +
          '</div>';
      }
      tierEl.innerHTML = tierHtml;

      // System health
      var healthEl = document.getElementById('healthGrid');
      var healthHtml = '';
      var services = ['database', 'stripe', 'twilio', 'resend', 'anthropic'];
      for (var j = 0; j < services.length; j++) {
        var svc = services[j];
        var info = health[svc];
        if (!info) continue;
        healthHtml += '<div class="admin-health-row">' +
          '<span class="admin-health-dot admin-health-dot--' + (info.status === 'ok' ? 'ok' : 'error') + '"></span>' +
          '<span class="admin-health-name">' + esc(svc) + '</span>' +
          '<span class="admin-health-latency">' + info.latencyMs + 'ms</span>' +
          '</div>';
      }
      healthEl.innerHTML = healthHtml;

      // Cron status
      var cronEl = document.getElementById('cronStatus');
      cronEl.innerHTML =
        '<div class="admin-cron-item"><span class="admin-cron-label">Last Daily Review</span><span class="admin-cron-value">' + esc(timeAgo(cron.lastDailyReview)) + '</span></div>' +
        '<div class="admin-cron-item"><span class="admin-cron-label">Last Weekly Digest</span><span class="admin-cron-value">' + esc(timeAgo(cron.lastWeeklyDigest)) + '</span></div>' +
        '<div class="admin-cron-item"><span class="admin-cron-label">Active Clients</span><span class="admin-cron-value">' + cron.activeClientCount + '</span></div>' +
        '<div class="admin-cron-item"><span class="admin-cron-label">Recent Errors (7d)</span><span class="admin-cron-value">' + (cron.recentErrors ? cron.recentErrors.length : 0) + '</span></div>';

      // Feature flags
      var flags = results[3].data || {};
      renderFeatureFlags(flags);

    } catch (err) {
      document.getElementById('kpiGrid').innerHTML = '<div class="admin-alert admin-alert--error">Failed to load overview: ' + esc(err.message) + '</div>';
    }
  }

  /* ============================================================
     CLIENTS TAB
     ============================================================ */

  var searchInput = document.getElementById('clientSearch');
  var tierFilter = document.getElementById('clientTierFilter');
  var statusFilter = document.getElementById('clientStatusFilter');

  searchInput.addEventListener('input', debounce(function () {
    clientsPage = 1;
    loadClients();
  }, 300));

  tierFilter.addEventListener('change', function () { clientsPage = 1; loadClients(); });
  statusFilter.addEventListener('change', function () { clientsPage = 1; loadClients(); });

  async function loadClients() {
    var params = '?page=' + clientsPage + '&limit=20';
    var search = searchInput.value.trim();
    if (search) params += '&search=' + encodeURIComponent(search);
    var tier = tierFilter.value;
    if (tier) params += '&tier=' + encodeURIComponent(tier);
    var status = statusFilter.value;
    if (status) params += '&status=' + encodeURIComponent(status);

    try {
      var res = await apiGet('/api/v1/admin/clients' + params);
      var data = res.data;
      clientsTotalPages = data.totalPages;

      var body = document.getElementById('clientsBody');
      if (!data.clients.length) {
        body.innerHTML = '<tr><td colspan="7" class="admin-empty">No clients found</td></tr>';
      } else {
        var html = '';
        for (var i = 0; i < data.clients.length; i++) {
          var c = data.clients[i];
          var name = c.athleteProfile
            ? esc(c.athleteProfile.firstName || '') + ' ' + esc(c.athleteProfile.lastName || '')
            : '—';
          var plan = c.subscription ? esc(fmtTier(c.subscription.planTier)) : '—';
          var st = c.subscription ? statusBadge(c.subscription.status) : '—';
          var adh = c.adherence ? fmtPct(c.adherence.rate) : '—';
          var cIsPaused = c.subscription && c.subscription.status === 'PAUSED';
          var cIsPending = c.subscription && c.subscription.status === 'PENDING_APPROVAL';
          html += '<tr class="admin-table-clickable" data-userid="' + esc(c.id) + '">' +
            '<td>' + name.trim() + '</td>' +
            '<td>' + esc(c.email) + '</td>' +
            '<td>' + plan + '</td>' +
            '<td>' + st + '</td>' +
            '<td>' + adh + '</td>' +
            '<td>' + fmtDate(c.createdAt) + '</td>' +
            '<td class="admin-row-actions" style="white-space:nowrap;">';
          if (cIsPending) {
            html += '<button class="admin-btn-small admin-row-approve" data-approve-id="' + esc(c.id) + '" style="border:1px solid #22c55e;color:#22c55e;background:transparent;padding:0.2rem 0.5rem;border-radius:4px;cursor:pointer;font-size:0.75rem;margin-right:0.25rem;">Approve</button>' +
              '<button class="admin-btn-small admin-row-reject" data-reject-id="' + esc(c.id) + '" style="border:1px solid #ef4444;color:#ef4444;background:transparent;padding:0.2rem 0.5rem;border-radius:4px;cursor:pointer;font-size:0.75rem;">Reject</button>';
          } else {
            html += '<button class="admin-btn-small admin-row-pause" data-pause-id="' + esc(c.id) + '" style="border:1px solid ' + (cIsPaused ? '#22c55e' : '#f59e0b') + ';color:' + (cIsPaused ? '#22c55e' : '#f59e0b') + ';background:transparent;padding:0.2rem 0.5rem;border-radius:4px;cursor:pointer;font-size:0.75rem;margin-right:0.25rem;">' + (cIsPaused ? 'Activate' : 'Pause') + '</button>' +
              '<button class="admin-btn-small admin-row-remove" data-remove-id="' + esc(c.id) + '" style="border:1px solid #ef4444;color:#ef4444;background:transparent;padding:0.2rem 0.5rem;border-radius:4px;cursor:pointer;font-size:0.75rem;">Remove</button>';
          }
          html += '</td></tr>';
        }
        body.innerHTML = html;

        // Click handler for rows (open detail on click, except action buttons)
        var rows = body.querySelectorAll('.admin-table-clickable');
        rows.forEach(function (row) {
          row.addEventListener('click', function (e) {
            if (e.target.closest('.admin-row-actions')) return;
            var userId = row.getAttribute('data-userid');
            openClientDetail(userId);
          });
        });

        // Pause/Activate buttons on table rows
        body.querySelectorAll('.admin-row-pause').forEach(function (btn) {
          btn.addEventListener('click', async function (e) {
            e.stopPropagation();
            var uid = btn.getAttribute('data-pause-id');
            var isPaused = btn.textContent.trim() === 'Activate';
            var action = isPaused ? 'activate' : 'pause';
            var msg = isPaused ? 'Reactivate this client?' : 'Pause this client?';
            if (!confirm(msg)) return;
            btn.disabled = true;
            btn.textContent = '...';
            try {
              await apiPut('/api/v1/admin/clients/' + encodeURIComponent(uid) + '/status', { action: action });
              loadClients();
            } catch (err) {
              alert('Failed: ' + err.message);
              btn.disabled = false;
              btn.textContent = isPaused ? 'Activate' : 'Pause';
            }
          });
        });

        // Remove buttons on table rows
        body.querySelectorAll('.admin-row-remove').forEach(function (btn) {
          btn.addEventListener('click', async function (e) {
            e.stopPropagation();
            var uid = btn.getAttribute('data-remove-id');
            if (!confirm('Permanently remove this client? This cannot be undone.')) return;
            if (!confirm('All data will be deleted. Are you sure?')) return;
            btn.disabled = true;
            btn.textContent = '...';
            try {
              await apiDelete('/api/v1/admin/clients/' + encodeURIComponent(uid));
              loadClients();
              loadPendingCount();
            } catch (err) {
              alert('Failed: ' + err.message);
              btn.disabled = false;
              btn.textContent = 'Remove';
            }
          });
        });

        // Approve buttons on table rows (for PENDING_APPROVAL clients)
        body.querySelectorAll('.admin-row-approve').forEach(function (btn) {
          btn.addEventListener('click', async function (e) {
            e.stopPropagation();
            var uid = btn.getAttribute('data-approve-id');
            if (!confirm('Approve this client? Their subscription will activate and welcome messages will be sent.')) return;
            btn.disabled = true;
            btn.textContent = '...';
            try {
              await apiPut('/api/v1/admin/clients/' + encodeURIComponent(uid) + '/status', { action: 'approve' });
              loadClients();
              loadPendingCount();
            } catch (err) {
              alert('Failed: ' + err.message);
              btn.disabled = false;
              btn.textContent = 'Approve';
            }
          });
        });

        // Reject buttons on table rows (for PENDING_APPROVAL clients)
        body.querySelectorAll('.admin-row-reject').forEach(function (btn) {
          btn.addEventListener('click', async function (e) {
            e.stopPropagation();
            var uid = btn.getAttribute('data-reject-id');
            if (!confirm('Reject this client? Their subscription will be canceled.')) return;
            btn.disabled = true;
            btn.textContent = '...';
            try {
              await apiPut('/api/v1/admin/clients/' + encodeURIComponent(uid) + '/status', { action: 'reject' });
              loadClients();
              loadPendingCount();
            } catch (err) {
              alert('Failed: ' + err.message);
              btn.disabled = false;
              btn.textContent = 'Reject';
            }
          });
        });
      }

      // Pagination
      renderPagination('clientsPagination', clientsPage, clientsTotalPages, function (pg) {
        clientsPage = pg;
        loadClients();
      });

    } catch (err) {
      document.getElementById('clientsBody').innerHTML = '<tr><td colspan="7" class="admin-alert admin-alert--error">' + esc(err.message) + '</td></tr>';
    }
  }

  function renderPagination(elId, page, totalPages, onPageChange) {
    var el = document.getElementById(elId);
    if (totalPages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML =
      '<button class="admin-page-btn"' + (page <= 1 ? ' disabled' : '') + ' id="' + elId + 'Prev">Prev</button>' +
      '<span>Page ' + page + ' of ' + totalPages + '</span>' +
      '<button class="admin-page-btn"' + (page >= totalPages ? ' disabled' : '') + ' id="' + elId + 'Next">Next</button>';

    var prev = document.getElementById(elId + 'Prev');
    var next = document.getElementById(elId + 'Next');
    if (prev && page > 1) prev.addEventListener('click', function () { onPageChange(page - 1); });
    if (next && page < totalPages) next.addEventListener('click', function () { onPageChange(page + 1); });
  }

  /* ============================================================
     CLIENT DETAIL PANEL
     ============================================================ */

  var detailOverlay = document.getElementById('detailOverlay');
  var detailPanel = document.getElementById('detailPanel');
  var detailCloseBtn = document.getElementById('detailCloseBtn');
  var detailBody = document.getElementById('detailBody');
  var detailName = document.getElementById('detailName');

  function openClientDetail(userId) {
    currentDetailUserId = userId;
    detailOverlay.classList.add('admin-detail-overlay--open');
    detailPanel.classList.add('admin-detail-panel--open');
    detailBody.innerHTML = '<div class="admin-loading" style="height:200px;margin-top:1rem;"></div>';
    detailName.textContent = 'Loading...';
    loadClientDetail(userId);
  }

  function closeClientDetail() {
    detailOverlay.classList.remove('admin-detail-overlay--open');
    detailPanel.classList.remove('admin-detail-panel--open');
    currentDetailUserId = null;
  }

  detailCloseBtn.addEventListener('click', closeClientDetail);
  detailOverlay.addEventListener('click', closeClientDetail);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (document.getElementById('overrideOverlay').classList.contains('admin-modal-overlay--open')) {
        closeOverrideModal();
      } else if (detailPanel.classList.contains('admin-detail-panel--open')) {
        closeClientDetail();
      }
    }
  });

  /**
   * Render a persistent alert in the Plan Management section.
   * Failure reasons must stay on screen long enough to read and copy — they are
   * the only surfaced diagnostic when AI generation falls back to templates.
   */
  function showPlanAlert(opts) {
    var el = document.getElementById('planMgmtAlert');
    if (!el) return;

    if (opts.kind === 'success') {
      el.innerHTML = '<div class="admin-alert admin-alert--success">AI plan generated (' +
        esc(opts.count) + ' sessions)</div>';
      return;
    }

    var html = '<div class="admin-alert admin-alert--error">' +
      '<strong>AI generation failed';
    if (opts.count != null) html += ' &mdash; template plan used (' + esc(opts.count) + ' sessions)';
    html += '.</strong>';
    if (opts.count != null) html += '<br>This client has a generic plan, not a personalized one.';

    if (opts.reason) {
      html += '<div style="margin-top:0.6rem;padding:0.6rem;background:rgba(0,0,0,0.35);' +
        'border-radius:4px;font-size:0.78rem;line-height:1.5;user-select:text;' +
        'white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto;" ' +
        'id="planErrText">' + esc(opts.reason) + '</div>' +
        '<button id="copyPlanErrBtn" style="margin-top:0.5rem;background:transparent;' +
        'border:1px solid currentColor;color:inherit;font-size:0.72rem;padding:0.3rem 0.7rem;' +
        'border-radius:4px;cursor:pointer;">Copy error</button>';
    }
    html += '</div>';
    el.innerHTML = html;

    var copyBtn = document.getElementById('copyPlanErrBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var txt = document.getElementById('planErrText');
        if (!txt) return;
        navigator.clipboard.writeText(txt.textContent).then(function () {
          copyBtn.textContent = 'Copied';
          setTimeout(function () { copyBtn.textContent = 'Copy error'; }, 2000);
        }).catch(function () { copyBtn.textContent = 'Select the text above to copy'; });
      });
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function loadClientDetail(userId) {
    try {
      var res = await apiGet('/api/v1/admin/clients/' + encodeURIComponent(userId));
      var d = res.data;

      var prof = d.athleteProfile || {};
      var sub = d.subscription;
      var name = (prof.firstName || '') + ' ' + (prof.lastName || '');
      detailName.textContent = name.trim() || d.email;

      var html = '';

      // Profile section — editable form
      html += '<div class="admin-detail-section">' +
        '<div class="admin-detail-section-title">Profile</div>' +
        detailRow('Email', d.email) +
        detailRow('Persona', prof.personaType) +
        detailRow('Risk Flags', Array.isArray(prof.riskFlags) && prof.riskFlags.length ? prof.riskFlags.join(', ') : 'None') +
        detailRow('Consecutive Missed', d.consecutiveMissed || 0) +
        '</div>';

      // Editable training fields
      html += '<div class="admin-detail-section">' +
        '<div class="admin-detail-section-title">Training Settings</div>' +
        '<div class="admin-form-row">' +
          '<div class="admin-form-group">' +
            '<label for="editGoal">Primary Goal</label>' +
            '<select class="admin-select" id="editGoal">' +
              profileOption('build-muscle', 'Build Muscle', prof.primaryGoal) +
              profileOption('lose-fat', 'Lose Fat', prof.primaryGoal) +
              profileOption('endurance', 'Endurance', prof.primaryGoal) +
              profileOption('recomposition', 'Recomposition', prof.primaryGoal) +
              profileOption('well-rounded', 'Well Rounded', prof.primaryGoal) +
            '</select>' +
          '</div>' +
          '<div class="admin-form-group">' +
            '<label for="editExperience">Experience Level</label>' +
            '<select class="admin-select" id="editExperience">' +
              profileOption('beginner', 'Beginner', prof.experienceLevel) +
              profileOption('intermediate', 'Intermediate', prof.experienceLevel) +
              profileOption('advanced', 'Advanced', prof.experienceLevel) +
              profileOption('elite', 'Elite', prof.experienceLevel) +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="admin-form-row">' +
          '<div class="admin-form-group">' +
            '<label for="editTrainingDays">Training Days/Week</label>' +
            '<input type="number" class="admin-input" id="editTrainingDays" min="1" max="7" value="' + (prof.trainingDaysPerWeek || 3) + '">' +
          '</div>' +
          '<div class="admin-form-group">' +
            '<label for="editStress">Stress Level (1-10)</label>' +
            '<input type="number" class="admin-input" id="editStress" min="1" max="10" value="' + (prof.stressLevel || '') + '">' +
          '</div>' +
        '</div>' +
        '<div class="admin-form-row">' +
          '<div class="admin-form-group">' +
            '<label for="editEquipment">Equipment Access</label>' +
            '<select class="admin-select" id="editEquipment">' +
              profileOption('full-gym', 'Full Gym', prof.equipmentAccess) +
              profileOption('home-gym', 'Home Gym', prof.equipmentAccess) +
              profileOption('minimal', 'Minimal', prof.equipmentAccess) +
              profileOption('bodyweight-only', 'Bodyweight Only', prof.equipmentAccess) +
            '</select>' +
          '</div>' +
          '<div class="admin-form-group">' +
            '<label for="editTrainingTime">Preferred Time</label>' +
            '<select class="admin-select" id="editTrainingTime">' +
              profileOption('morning', 'Morning', prof.preferredTrainingTime) +
              profileOption('midday', 'Midday', prof.preferredTrainingTime) +
              profileOption('evening', 'Evening', prof.preferredTrainingTime) +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label for="editTimezone">Timezone</label>' +
          '<select class="admin-select" id="editTimezone">' +
            profileOption('America/New_York', 'Eastern (ET)', prof.timezone) +
            profileOption('America/Chicago', 'Central (CT)', prof.timezone) +
            profileOption('America/Denver', 'Mountain (MT)', prof.timezone) +
            profileOption('America/Los_Angeles', 'Pacific (PT)', prof.timezone) +
            profileOption('America/Anchorage', 'Alaska (AKT)', prof.timezone) +
            profileOption('Pacific/Honolulu', 'Hawaii (HT)', prof.timezone) +
          '</select>' +
        '</div>' +
        '<div class="admin-form-group">' +
          '<label for="editInjury">Injury History</label>' +
          '<textarea class="admin-textarea" id="editInjury" rows="2" placeholder="None">' + esc(prof.injuryHistory || '') + '</textarea>' +
        '</div>' +
        '<button class="admin-btn-primary admin-btn-small" id="saveProfileBtn" style="margin-top:0.5rem;">Save Profile</button>' +
        '<div id="profileAlert"></div>' +
        '</div>';

      // Subscription section
      html += '<div class="admin-detail-section">' +
        '<div class="admin-detail-section-title">Subscription</div>';
      if (sub) {
        html += detailRow('Plan', fmtTier(sub.planTier)) +
          detailRow('Status', statusBadge(sub.status), true) +
          detailRow('Period End', fmtDate(sub.currentPeriodEnd));
        if (sub.status === 'PENDING_APPROVAL') {
          html += '<div style="display:flex;gap:0.5rem;margin-top:0.75rem;">' +
            '<button class="admin-btn-primary admin-btn-small" id="approveClientBtn" style="background:#22c55e;border-color:#22c55e;">Approve</button>' +
            '<button class="admin-btn-secondary admin-btn-small" id="rejectClientBtn" style="border-color:#ef4444;color:#ef4444;">Reject</button>' +
            '</div>' +
            '<div id="approvalAlert" style="margin-top:0.5rem;"></div>';
        }
      } else {
        html += '<div class="admin-detail-row"><span class="admin-detail-label">No subscription</span></div>';
      }
      html += '</div>';

      // Adherence history
      if (d.adherenceHistory && d.adherenceHistory.length) {
        html += '<div class="admin-detail-section">' +
          '<div class="admin-detail-section-title">Adherence (8 Weeks)</div>' +
          '<table class="admin-mini-table"><thead><tr><th>Week</th><th>Rate</th><th>Done</th><th>Sched</th></tr></thead><tbody>';
        for (var a = 0; a < d.adherenceHistory.length; a++) {
          var ah = d.adherenceHistory[a];
          html += '<tr><td>' + fmtDate(ah.weekStartDate) + '</td><td>' + fmtPct(ah.adherenceRate) + '</td><td>' + ah.completedCount + '</td><td>' + ah.scheduledCount + '</td></tr>';
        }
        html += '</tbody></table></div>';
      }

      // Current workout sessions
      var sessions = (prof.workoutPlans && prof.workoutPlans[0] && prof.workoutPlans[0].sessions) || [];
      if (sessions.length) {
        html += '<div class="admin-detail-section">' +
          '<div class="admin-detail-section-title">Current Plan Sessions</div>' +
          '<table class="admin-mini-table"><thead><tr><th>Date</th><th>Title</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>';
        for (var s = 0; s < sessions.length; s++) {
          var sess = sessions[s];
          html += '<tr>' +
            '<td>' + fmtDate(sess.scheduledDate) + '</td>' +
            '<td>' + esc(sess.title) + '</td>' +
            '<td>' + esc(sess.sessionType) + '</td>' +
            '<td>' + statusBadge(sess.status) + '</td>' +
            '<td><button class="admin-btn-secondary admin-btn-small" data-override-id="' + esc(sess.id) + '">Override</button></td>' +
            '</tr>';
        }
        html += '</tbody></table></div>';
      }

      // Messaging toggle + thread
      var msgDisabled = prof.messagingDisabled || false;
      html += '<div class="admin-detail-section">' +
        '<div class="admin-detail-section-title" style="display:flex;justify-content:space-between;align-items:center;">' +
          '<span>Messages</span>' +
          '<label class="admin-toggle">' +
            '<input type="checkbox" id="msgToggle"' + (msgDisabled ? ' checked' : '') + '>' +
            '<span class="admin-toggle-slider"></span>' +
            '<span class="admin-toggle-label">' + (msgDisabled ? 'Paused' : 'Active') + '</span>' +
          '</label>' +
        '</div>';

      // Show messaging status banner
      if (msgDisabled) {
        html += '<div style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);color:#f87171;padding:0.5rem 0.75rem;font-size:0.75rem;margin-bottom:0.5rem;">Messaging paused for this client (per-user toggle)</div>';
      }

      if (d.messageLogs && d.messageLogs.length) {
        html += '<div class="admin-msg-thread">';
        for (var m = 0; m < d.messageLogs.length; m++) {
          var msg = d.messageLogs[m];
          var msgFailed = !!msg.failedAt;
          var channelIcon = msg.channel === 'SMS' ? 'SMS' : 'EMAIL';
          html += '<div class="admin-msg-item' + (msgFailed ? ' admin-msg-item--failed' : '') + '">' +
            '<div class="admin-msg-meta">' +
              '<span class="admin-msg-channel">' + esc(channelIcon) + '</span>' +
              '<span class="admin-msg-category">' + esc(msg.category) + '</span>' +
              '<span class="admin-msg-time">' + fmtDateTime(msg.sentAt) + '</span>' +
              (msgFailed ? '<span class="admin-msg-status admin-msg-status--failed">Failed</span>' : '<span class="admin-msg-status admin-msg-status--sent">Sent</span>') +
            '</div>' +
            '<div class="admin-msg-content">' + esc(msg.content || '') + '</div>' +
            (msg.failureReason ? '<div class="admin-msg-error">' + esc(msg.failureReason) + '</div>' : '') +
          '</div>';
        }
        html += '</div>';
      } else {
        html += '<div class="admin-empty" style="padding:1rem;">No messages sent yet</div>';
      }
      html += '</div>';

      // Escalation events
      if (d.escalationEvents && d.escalationEvents.length) {
        html += '<div class="admin-detail-section">' +
          '<div class="admin-detail-section-title">Escalations</div>';
        for (var e = 0; e < d.escalationEvents.length; e++) {
          var ev = d.escalationEvents[e];
          html += '<div class="admin-esc-card" style="margin-bottom:0.5rem;padding:0.6rem 0.8rem;">' +
            '<div class="admin-esc-card-header">' +
            '<span class="admin-badge admin-badge--' + (ev.resolvedAt ? 'active' : 'canceled') + '">' + esc(ev.escalationLevel) + '</span>' +
            '<span class="admin-esc-date">' + fmtDate(ev.createdAt) + '</span>' +
            '</div>' +
            '<div class="admin-esc-reason">' + esc(ev.triggerReason) + '</div>' +
            (ev.resolution ? '<div class="admin-esc-resolution">' + esc(ev.resolution) + '</div>' : '') +
            '</div>';
        }
        html += '</div>';
      }

      // Admin notes — stored in dedicated adminNotes field (never in aiSummary)
      var adminNotesOnly = prof.adminNotes || '';
      html += '<div class="admin-detail-section">' +
        '<div class="admin-detail-section-title">Admin Notes</div>' +
        '<textarea class="admin-textarea" id="detailNotes" rows="4" placeholder="Add notes about this client...">' + esc(adminNotesOnly) + '</textarea>' +
        '<button class="admin-btn-primary admin-btn-small" id="saveNotesBtn" style="margin-top:0.5rem;">Save Notes</button>' +
        '<div id="notesAlert"></div>' +
        '</div>';

      // Send custom message
      html += '<div class="admin-detail-section">' +
        '<div class="admin-detail-section-title">Send Message</div>' +
        '<div class="admin-channel-toggle">' +
        '<button class="admin-channel-btn admin-channel-btn--active" data-channel="SMS">SMS</button>' +
        '<button class="admin-channel-btn" data-channel="EMAIL">Email</button>' +
        '</div>' +
        '<textarea class="admin-textarea" id="detailMsgContent" rows="3" placeholder="Message content..."></textarea>' +
        '<button class="admin-btn-primary admin-btn-small" id="sendMsgBtn" style="margin-top:0.5rem;">Send</button>' +
        '<div id="msgAlert"></div>' +
        '</div>';

      // Chat history
      html += '<div class="admin-detail-section">' +
        '<div class="admin-detail-section-title">AI Coach Conversation</div>' +
        '<div id="detailChatHistory" style="max-height:250px;overflow-y:auto;"><div class="admin-empty" style="padding:1rem;">Loading...</div></div>' +
        '</div>';

      // Actions: trigger review, pause/activate, remove
      var isPaused = sub && sub.status === 'PAUSED';
      // Plan management — only show for clients with subscriptions
      if (sub) {
      html += '<div class="admin-detail-section">' +
        '<div class="admin-detail-section-title">Plan Management</div>' +
        '<div class="admin-form-row" style="gap:0.5rem;margin-bottom:0.5rem;">' +
          '<div class="onboard-field" style="margin:0;flex:1;">' +
            '<label for="changeTierSelect" style="font-size:0.7rem;">Change Plan Tier</label>' +
            '<select class="admin-select" id="changeTierSelect" style="padding:0.5rem;">' +
              '<option value="PRIVATE_COACHING"' + (sub && sub.planTier === 'PRIVATE_COACHING' ? ' selected' : '') + '>Private Coaching</option>' +
              '<option value="TRAINING_30DAY"' + (sub && sub.planTier === 'TRAINING_30DAY' ? ' selected' : '') + '>Training 30-Day</option>' +
              '<option value="TRAINING_60DAY"' + (sub && sub.planTier === 'TRAINING_60DAY' ? ' selected' : '') + '>Training 60-Day</option>' +
              '<option value="TRAINING_90DAY"' + (sub && sub.planTier === 'TRAINING_90DAY' ? ' selected' : '') + '>Training 90-Day</option>' +
              '<option value="NUTRITION_4WEEK"' + (sub && sub.planTier === 'NUTRITION_4WEEK' ? ' selected' : '') + '>Nutrition 4-Week</option>' +
              '<option value="NUTRITION_8WEEK"' + (sub && sub.planTier === 'NUTRITION_8WEEK' ? ' selected' : '') + '>Nutrition 8-Week</option>' +
            '</select>' +
          '</div>' +
          '<button class="admin-btn-secondary admin-btn-small" id="changeTierBtn" style="align-self:flex-end;">Update Tier</button>' +
        '</div>' +
        '<div class="admin-form-row" style="gap:0.5rem;margin-bottom:0.5rem;">' +
          '<div class="onboard-field" style="margin:0;flex:1;">' +
            '<label for="extendDaysInput" style="font-size:0.7rem;">Extend Subscription (days)</label>' +
            '<input type="number" class="admin-input" id="extendDaysInput" min="1" max="365" value="30" style="padding:0.5rem;">' +
          '</div>' +
          '<button class="admin-btn-secondary admin-btn-small" id="extendSubBtn" style="align-self:flex-end;">Extend</button>' +
        '</div>' +
        '<button class="admin-btn-secondary admin-btn-small" id="regenPlanBtn" style="margin-top:0.25rem;">Regenerate AI Plan</button>' +
        '<div id="planMgmtAlert" style="margin-top:0.5rem;"></div>' +
        '</div>';
      } // end if (sub) — plan management

      // Actions
      html += '<div class="admin-detail-section">' +
        '<div class="admin-detail-section-title">Actions</div>' +
        '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">' +
        '<button class="admin-btn-secondary" id="triggerReviewBtn">Trigger Daily Review</button>' +
        '<button class="admin-btn-secondary" id="pauseClientBtn" style="border-color:' + (isPaused ? '#22c55e' : '#f59e0b') + ';color:' + (isPaused ? '#22c55e' : '#f59e0b') + ';">' + (isPaused ? 'Reactivate Client' : 'Pause Client') + '</button>' +
        '<button class="admin-btn-secondary" id="removeClientBtn" style="border-color:#ef4444;color:#ef4444;">Remove Client</button>' +
        '</div>' +
        '<div id="reviewAlert" style="margin-top:0.5rem;"></div>' +
        '<div id="statusAlert" style="margin-top:0.5rem;"></div>' +
        '</div>';

      detailBody.innerHTML = html;

      // Bind detail events
      bindDetailEvents(userId, sessions);
      loadDetailChat(userId);

    } catch (err) {
      detailBody.innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
    }
  }

  function detailRow(label, value, rawHtml) {
    if (rawHtml) {
      return '<div class="admin-detail-row"><span class="admin-detail-label">' + esc(label) + '</span><span class="admin-detail-value">' + value + '</span></div>';
    }
    var display = (value != null && value !== '') ? value : '—';
    return '<div class="admin-detail-row"><span class="admin-detail-label">' + esc(label) + '</span><span class="admin-detail-value">' + esc(display) + '</span></div>';
  }

  // Load chat history into detail panel
  async function loadDetailChat(userId) {
    var el = document.getElementById('detailChatHistory');
    if (!el) return;
    try {
      var res = await apiGet('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/chat');
      var msgs = (res.data && res.data.messages) || [];
      if (msgs.length === 0) {
        el.innerHTML = '<div class="admin-empty" style="padding:1rem;">No conversation yet</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i];
        var isUser = m.role === 'user';
        html += '<div style="margin-bottom:0.5rem;padding:0.5rem 0.6rem;background:' + (isUser ? 'rgba(192,192,192,0.06)' : 'rgba(74,222,128,0.06)') + ';border-left:2px solid ' + (isUser ? 'rgba(192,192,192,0.3)' : 'rgba(74,222,128,0.3)') + ';">' +
          '<div style="font-size:0.65rem;color:rgba(192,192,192,0.4);margin-bottom:0.2rem;">' + (isUser ? 'Client' : 'AI Coach') + ' &middot; ' + fmtDateTime(m.createdAt) + '</div>' +
          '<div style="font-size:0.8rem;color:#c0c0c0;">' + esc(m.content) + '</div>' +
        '</div>';
      }
      el.innerHTML = html;
      el.scrollTop = el.scrollHeight;
    } catch (err) {
      el.innerHTML = '<div class="admin-empty" style="padding:1rem;color:#f87171;">Failed to load chat</div>';
    }
  }

  function bindDetailEvents(userId, sessions) {
    // Approve client (in detail panel)
    var approveBtn = document.getElementById('approveClientBtn');
    if (approveBtn) {
      approveBtn.addEventListener('click', async function () {
        if (!confirm('Approve this client? Their subscription will activate and welcome messages will be sent.')) return;
        approveBtn.disabled = true;
        approveBtn.textContent = 'Approving...';
        try {
          await apiPut('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/status', { action: 'approve' });
          document.getElementById('approvalAlert').innerHTML = '<div class="admin-alert admin-alert--success">Client approved and activated</div>';
          loadClientDetail(userId);
          loadClients();
          loadPendingCount();
        } catch (err) {
          document.getElementById('approvalAlert').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
          approveBtn.disabled = false;
          approveBtn.textContent = 'Approve';
        }
      });
    }

    // Reject client (in detail panel)
    var rejectBtn = document.getElementById('rejectClientBtn');
    if (rejectBtn) {
      rejectBtn.addEventListener('click', async function () {
        if (!confirm('Reject this client? Their subscription will be canceled.')) return;
        rejectBtn.disabled = true;
        rejectBtn.textContent = 'Rejecting...';
        try {
          await apiPut('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/status', { action: 'reject' });
          document.getElementById('approvalAlert').innerHTML = '<div class="admin-alert admin-alert--success">Client rejected — subscription canceled</div>';
          loadClientDetail(userId);
          loadClients();
          loadPendingCount();
        } catch (err) {
          document.getElementById('approvalAlert').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
          rejectBtn.disabled = false;
          rejectBtn.textContent = 'Reject';
        }
      });
    }

    // Change tier
    var changeTierBtn = document.getElementById('changeTierBtn');
    if (changeTierBtn) {
      changeTierBtn.addEventListener('click', async function () {
        var tier = document.getElementById('changeTierSelect').value;
        if (!confirm('Change this client\'s plan to ' + tier + '?')) return;
        changeTierBtn.disabled = true;
        try {
          await apiPut('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/tier', { tier: tier });
          document.getElementById('planMgmtAlert').innerHTML = '<div class="admin-alert admin-alert--success">Plan tier updated</div>';
          loadClientDetail(userId);
        } catch (err) {
          document.getElementById('planMgmtAlert').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
        } finally { changeTierBtn.disabled = false; }
      });
    }

    // Extend subscription
    var extendSubBtn = document.getElementById('extendSubBtn');
    if (extendSubBtn) {
      extendSubBtn.addEventListener('click', async function () {
        var days = parseInt(document.getElementById('extendDaysInput').value, 10);
        if (!days || days < 1) { alert('Enter a valid number of days'); return; }
        if (!confirm('Extend subscription by ' + days + ' days?')) return;
        extendSubBtn.disabled = true;
        try {
          await apiPut('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/extend', { days: days });
          document.getElementById('planMgmtAlert').innerHTML = '<div class="admin-alert admin-alert--success">Subscription extended by ' + days + ' days</div>';
          loadClientDetail(userId);
        } catch (err) {
          document.getElementById('planMgmtAlert').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
        } finally { extendSubBtn.disabled = false; }
      });
    }

    // Regenerate plan
    var regenPlanBtn = document.getElementById('regenPlanBtn');
    if (regenPlanBtn) {
      regenPlanBtn.addEventListener('click', async function () {
        if (!confirm('Regenerate this client\'s workout plan using AI? This replaces their current plan.')) return;
        regenPlanBtn.disabled = true;
        regenPlanBtn.textContent = 'Generating...';
        try {
          var res = await apiPost('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/regenerate-plan');
          var d = res.data || {};
          var count = d.sessionCount != null ? d.sessionCount : '?';

          // Refresh FIRST — loadClientDetail re-renders the panel and would wipe
          // any alert written before it, which made the failure reason flash and
          // vanish before it could be read.
          await loadClientDetail(userId);
          showPlanAlert(
            d.source === 'fallback'
              ? { kind: 'error', reason: d.fallbackReason, count: count }
              : { kind: 'success', count: count }
          );
        } catch (err) {
          showPlanAlert({ kind: 'error', reason: err.message });
        } finally { regenPlanBtn.disabled = false; regenPlanBtn.textContent = 'Regenerate AI Plan'; }
      });
    }

    // Save profile
    var saveProfileBtn = document.getElementById('saveProfileBtn');
    if (saveProfileBtn) {
      saveProfileBtn.addEventListener('click', async function () {
        saveProfileBtn.disabled = true;
        saveProfileBtn.textContent = 'Saving...';
        try {
          var payload = {};
          var goal = document.getElementById('editGoal').value;
          if (goal) payload.primaryGoal = goal;
          var exp = document.getElementById('editExperience').value;
          if (exp) payload.experienceLevel = exp;
          var days = document.getElementById('editTrainingDays').value;
          if (days) payload.trainingDaysPerWeek = parseInt(days, 10);
          var stress = document.getElementById('editStress').value;
          if (stress) payload.stressLevel = parseInt(stress, 10);
          var equip = document.getElementById('editEquipment').value;
          if (equip) payload.equipmentAccess = equip;
          var time = document.getElementById('editTrainingTime').value;
          if (time) payload.preferredTrainingTime = time;
          var tz = document.getElementById('editTimezone').value;
          if (tz) payload.timezone = tz;
          var injury = document.getElementById('editInjury').value.trim();
          payload.injuryHistory = injury || null;

          await apiPut('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/profile', payload);
          document.getElementById('profileAlert').innerHTML = '<div class="admin-alert admin-alert--success">Profile saved</div>';
          setTimeout(function () {
            var el = document.getElementById('profileAlert');
            if (el) el.innerHTML = '';
          }, 3000);
        } catch (err) {
          document.getElementById('profileAlert').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
        } finally {
          saveProfileBtn.disabled = false;
          saveProfileBtn.textContent = 'Save Profile';
        }
      });
    }

    // Save notes
    var saveNotesBtn = document.getElementById('saveNotesBtn');
    if (saveNotesBtn) {
      saveNotesBtn.addEventListener('click', async function () {
        saveNotesBtn.disabled = true;
        saveNotesBtn.textContent = 'Saving...';
        try {
          var notes = document.getElementById('detailNotes').value.trim();
          if (!notes) {
            document.getElementById('notesAlert').innerHTML = '<div class="admin-alert admin-alert--error">Notes cannot be empty</div>';
            saveNotesBtn.disabled = false;
            saveNotesBtn.textContent = 'Save Notes';
            return;
          }
          await apiPut('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/notes', { notes: notes });
          document.getElementById('notesAlert').innerHTML = '<div class="admin-alert admin-alert--success">Notes saved</div>';
          setTimeout(function () {
            var el = document.getElementById('notesAlert');
            if (el) el.innerHTML = '';
          }, 3000);
        } catch (err) {
          document.getElementById('notesAlert').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
        } finally {
          saveNotesBtn.disabled = false;
          saveNotesBtn.textContent = 'Save Notes';
        }
      });
    }

    // Messaging toggle (per-client disable)
    var msgToggle = document.getElementById('msgToggle');
    if (msgToggle) {
      msgToggle.addEventListener('change', async function () {
        var disabled = msgToggle.checked;
        var label = msgToggle.parentElement.querySelector('.admin-toggle-label');
        try {
          await apiPut('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/profile', {
            messagingDisabled: disabled
          });
          if (label) label.textContent = disabled ? 'Paused' : 'Active';
        } catch (err) {
          // Revert on failure
          msgToggle.checked = !disabled;
          alert('Failed to update messaging: ' + err.message);
        }
      });
    }

    // Channel toggle
    var channelBtns = detailBody.querySelectorAll('.admin-channel-btn');
    channelBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        channelBtns.forEach(function (b) { b.classList.remove('admin-channel-btn--active'); });
        btn.classList.add('admin-channel-btn--active');
      });
    });

    // Send message
    var sendMsgBtn = document.getElementById('sendMsgBtn');
    if (sendMsgBtn) {
      sendMsgBtn.addEventListener('click', async function () {
        var content = document.getElementById('detailMsgContent').value.trim();
        if (!content) return;
        var activeChannel = detailBody.querySelector('.admin-channel-btn--active');
        var channel = activeChannel ? activeChannel.getAttribute('data-channel') : 'SMS';
        sendMsgBtn.disabled = true;
        sendMsgBtn.textContent = 'Sending...';
        try {
          await apiPost('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/message', {
            content: content,
            channel: channel
          });
          document.getElementById('msgAlert').innerHTML = '<div class="admin-alert admin-alert--success">Message sent via ' + esc(channel) + '</div>';
          document.getElementById('detailMsgContent').value = '';
          // Refresh thread to show the new message
          loadClientDetail(userId);
          setTimeout(function () {
            var el = document.getElementById('msgAlert');
            if (el) el.innerHTML = '';
          }, 3000);
        } catch (err) {
          document.getElementById('msgAlert').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
        } finally {
          sendMsgBtn.disabled = false;
          sendMsgBtn.textContent = 'Send';
        }
      });
    }

    // Trigger review
    var triggerBtn = document.getElementById('triggerReviewBtn');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', async function () {
        triggerBtn.disabled = true;
        triggerBtn.textContent = 'Running...';
        try {
          var res = await apiPost('/api/v1/admin/system/trigger-review/' + encodeURIComponent(userId));
          var msg = res.data ? 'Review completed in ' + res.data.durationMs + 'ms' : 'Review completed';
          document.getElementById('reviewAlert').innerHTML = '<div class="admin-alert admin-alert--success">' + esc(msg) + '</div>';
          setTimeout(function () {
            var el = document.getElementById('reviewAlert');
            if (el) el.innerHTML = '';
          }, 5000);
        } catch (err) {
          document.getElementById('reviewAlert').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
        } finally {
          triggerBtn.disabled = false;
          triggerBtn.textContent = 'Trigger Daily Review';
        }
      });
    }

    // Pause / Reactivate client
    var pauseBtn = document.getElementById('pauseClientBtn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', async function () {
        var isPaused = pauseBtn.textContent.trim().indexOf('Reactivate') === 0;
        var action = isPaused ? 'activate' : 'pause';
        var confirmMsg = isPaused
          ? 'Reactivate this client? Their subscription and messaging will resume.'
          : 'Pause this client? Their subscription will be paused and messaging will stop.';
        if (!confirm(confirmMsg)) return;
        pauseBtn.disabled = true;
        pauseBtn.textContent = 'Updating...';
        try {
          await apiPut('/api/v1/admin/clients/' + encodeURIComponent(userId) + '/status', { action: action });
          document.getElementById('statusAlert').innerHTML = '<div class="admin-alert admin-alert--success">Client ' + (action === 'pause' ? 'paused' : 'reactivated') + '</div>';
          // Refresh detail panel and client list
          loadClientDetail(userId);
          loadClients();
        } catch (err) {
          document.getElementById('statusAlert').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
          pauseBtn.disabled = false;
          pauseBtn.textContent = isPaused ? 'Reactivate Client' : 'Pause Client';
        }
      });
    }

    // Remove client permanently
    var removeBtn = document.getElementById('removeClientBtn');
    if (removeBtn) {
      removeBtn.addEventListener('click', async function () {
        if (!confirm('Are you sure you want to permanently remove this client? This cannot be undone.')) return;
        if (!confirm('This will delete ALL their data (profile, workouts, messages, subscription). Type OK to confirm.')) return;
        removeBtn.disabled = true;
        removeBtn.textContent = 'Removing...';
        try {
          await apiDelete('/api/v1/admin/clients/' + encodeURIComponent(userId));
          closeClientDetail();
          loadClients();
        } catch (err) {
          document.getElementById('statusAlert').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
          removeBtn.disabled = false;
          removeBtn.textContent = 'Remove Client';
        }
      });
    }

    // Workout override buttons
    var overrideBtns = detailBody.querySelectorAll('[data-override-id]');
    overrideBtns.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var sessionId = btn.getAttribute('data-override-id');
        var sessionData = null;
        for (var i = 0; i < sessions.length; i++) {
          if (sessions[i].id === sessionId) { sessionData = sessions[i]; break; }
        }
        openOverrideModal(sessionId, sessionData);
      });
    });
  }

  /* ============================================================
     WORKOUT OVERRIDE MODAL
     ============================================================ */

  var overrideOverlay = document.getElementById('overrideOverlay');
  var overrideCloseBtn = document.getElementById('overrideCloseBtn');
  var overrideCancelBtn = document.getElementById('overrideCancelBtn');
  var overrideForm = document.getElementById('overrideForm');

  function openOverrideModal(sessionId, data) {
    document.getElementById('overrideSessionId').value = sessionId;
    document.getElementById('overrideTitle').value = (data && data.title) || '';
    document.getElementById('overrideDesc').value = (data && data.description) || '';
    document.getElementById('overrideType').value = (data && data.sessionType) || 'STRENGTH_UPPER';
    document.getElementById('overrideStatus').value = (data && data.status) || 'SCHEDULED';
    document.getElementById('overrideDuration').value = (data && data.prescribedDuration) || (data && data.actualDuration) || '';
    document.getElementById('overrideTSS').value = (data && data.prescribedTSS) || '';
    document.getElementById('overrideNotes').value = (data && data.athleteNotes) || '';
    overrideOverlay.classList.add('admin-modal-overlay--open');
  }

  function closeOverrideModal() {
    overrideOverlay.classList.remove('admin-modal-overlay--open');
  }

  overrideCloseBtn.addEventListener('click', closeOverrideModal);
  overrideCancelBtn.addEventListener('click', closeOverrideModal);
  overrideOverlay.addEventListener('click', function (e) {
    if (e.target === overrideOverlay) closeOverrideModal();
  });

  overrideForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var sessionId = document.getElementById('overrideSessionId').value;
    var saveBtn = document.getElementById('overrideSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    var payload = {};
    var title = document.getElementById('overrideTitle').value.trim();
    if (title) payload.title = title;
    var desc = document.getElementById('overrideDesc').value.trim();
    if (desc) payload.description = desc;
    payload.sessionType = document.getElementById('overrideType').value;
    payload.status = document.getElementById('overrideStatus').value;
    var dur = document.getElementById('overrideDuration').value;
    if (dur) payload.prescribedDuration = parseInt(dur, 10);
    var tss = document.getElementById('overrideTSS').value;
    if (tss) payload.prescribedTSS = parseFloat(tss);
    var notes = document.getElementById('overrideNotes').value.trim();
    if (notes) payload.athleteNotes = notes;

    try {
      await apiPut('/api/v1/admin/workout/' + encodeURIComponent(sessionId), payload);
      closeOverrideModal();
      // Refresh client detail
      if (currentDetailUserId) loadClientDetail(currentDetailUserId);
    } catch (err) {
      alert('Override failed: ' + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Override';
    }
  });

  /* ============================================================
     ADHERENCE TAB
     ============================================================ */

  async function loadAdherence() {
    try {
      var res = await apiGet('/api/v1/admin/analytics/adherence');
      var weeks = res.data;

      // Render table
      var body = document.getElementById('adherenceBody');
      if (!weeks || !weeks.length) {
        body.innerHTML = '<tr><td colspan="6" class="admin-empty">No adherence data yet</td></tr>';
      } else {
        var html = '';
        for (var i = 0; i < weeks.length; i++) {
          var w = weeks[i];
          html += '<tr>' +
            '<td>' + esc(w.weekStart) + '</td>' +
            '<td>' + fmtPct(w.avgAdherenceRate) + '</td>' +
            '<td>' + w.totalCompleted + '</td>' +
            '<td>' + w.totalScheduled + '</td>' +
            '<td>' + w.totalMissed + '</td>' +
            '<td>' + w.clientCount + '</td>' +
            '</tr>';
        }
        body.innerHTML = html;

        // Draw chart
        drawAdherenceChart(weeks);
      }

    } catch (err) {
      document.getElementById('adherenceBody').innerHTML = '<tr><td colspan="6" class="admin-alert admin-alert--error">' + esc(err.message) + '</td></tr>';
    }
  }

  function drawAdherenceChart(weeks) {
    var canvas = document.getElementById('adherenceChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.parentElement.clientWidth;
    var h = 280;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    var padLeft = 50;
    var padRight = 20;
    var padTop = 20;
    var padBottom = 50;
    var chartW = w - padLeft - padRight;
    var chartH = h - padTop - padBottom;

    // Clear
    ctx.clearRect(0, 0, w, h);

    if (weeks.length === 0) return;

    // Y-axis: 0-100%
    ctx.strokeStyle = 'rgba(192,192,192,0.08)';
    ctx.lineWidth = 1;
    ctx.font = '10px DM Sans, sans-serif';
    ctx.fillStyle = 'rgba(192,192,192,0.35)';
    ctx.textAlign = 'right';
    for (var y = 0; y <= 100; y += 25) {
      var yy = padTop + chartH - (y / 100) * chartH;
      ctx.beginPath();
      ctx.moveTo(padLeft, yy);
      ctx.lineTo(w - padRight, yy);
      ctx.stroke();
      ctx.fillText(y + '%', padLeft - 8, yy + 3);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(192,192,192,0.35)';
    var stepX = chartW / Math.max(1, weeks.length - 1);
    for (var xi = 0; xi < weeks.length; xi++) {
      var xx = padLeft + xi * stepX;
      var label = weeks[xi].weekStart.substring(5); // MM-DD
      ctx.save();
      ctx.translate(xx, h - padBottom + 16);
      ctx.rotate(-0.4);
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    // Gradient fill
    var grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
    grad.addColorStop(0, 'rgba(192,192,192,0.12)');
    grad.addColorStop(1, 'rgba(192,192,192,0)');

    ctx.beginPath();
    for (var gi = 0; gi < weeks.length; gi++) {
      var gx = padLeft + gi * stepX;
      var gRate = weeks[gi].avgAdherenceRate;
      var gy = padTop + chartH - (gRate * 100 / 100) * chartH;
      if (gi === 0) ctx.moveTo(gx, gy);
      else ctx.lineTo(gx, gy);
    }
    ctx.lineTo(padLeft + (weeks.length - 1) * stepX, padTop + chartH);
    ctx.lineTo(padLeft, padTop + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#c0c0c0';
    ctx.lineWidth = 2;
    for (var li = 0; li < weeks.length; li++) {
      var lx = padLeft + li * stepX;
      var lRate = weeks[li].avgAdherenceRate;
      var ly = padTop + chartH - (lRate * 100 / 100) * chartH;
      if (li === 0) ctx.moveTo(lx, ly);
      else ctx.lineTo(lx, ly);
    }
    ctx.stroke();

    // Dots
    ctx.fillStyle = '#c0c0c0';
    for (var di = 0; di < weeks.length; di++) {
      var dx = padLeft + di * stepX;
      var dRate = weeks[di].avgAdherenceRate;
      var dy = padTop + chartH - (dRate * 100 / 100) * chartH;
      ctx.beginPath();
      ctx.arc(dx, dy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ============================================================
     ESCALATIONS TAB
     ============================================================ */

  var escFilterBtns = document.querySelectorAll('#tabEscalations .admin-filter-btn');
  escFilterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      escFilterBtns.forEach(function (b) { b.classList.remove('admin-filter-btn--active'); });
      btn.classList.add('admin-filter-btn--active');
      escalationFilter = btn.getAttribute('data-filter');
      escalationsPage = 1;
      loadEscalations();
    });
  });

  async function loadEscalations() {
    var params = '?page=' + escalationsPage + '&limit=20';
    if (escalationFilter === 'resolved') params += '&resolved=true';
    else if (escalationFilter === 'unresolved') params += '&resolved=false';

    try {
      var res = await apiGet('/api/v1/admin/analytics/escalations' + params);
      var data = res.data;
      escalationsTotalPages = data.totalPages;

      var listEl = document.getElementById('escalationsList');
      if (!data.escalations || !data.escalations.length) {
        listEl.innerHTML = '<div class="admin-empty">No escalations found</div>';
      } else {
        var html = '';
        for (var i = 0; i < data.escalations.length; i++) {
          var esc_item = data.escalations[i];
          var clientName = '—';
          if (esc_item.user && esc_item.user.athleteProfile) {
            clientName = (esc_item.user.athleteProfile.firstName || '') + ' ' + (esc_item.user.athleteProfile.lastName || '');
            clientName = clientName.trim() || esc_item.user.email || '—';
          } else if (esc_item.user) {
            clientName = esc_item.user.email || '—';
          }
          html += '<div class="admin-esc-card">' +
            '<div class="admin-esc-card-header">' +
            '<span class="admin-esc-client">' + esc(clientName) + '</span>' +
            '<span class="admin-esc-date">' + fmtDate(esc_item.createdAt) + '</span>' +
            '</div>' +
            '<div class="admin-esc-reason">' + esc(esc_item.triggerReason) + '</div>' +
            '<div class="admin-esc-meta">' +
            '<span>Level: ' + esc(esc_item.escalationLevel) + '</span>' +
            '<span>Msg: ' + (esc_item.messageSent ? 'Yes' : 'No') + '</span>' +
            '<span>Call: ' + (esc_item.callBooked ? 'Yes' : 'No') + '</span>' +
            '<span>' + (esc_item.resolvedAt ? statusBadge('COMPLETED') : statusBadge('MISSED')) + '</span>' +
            '</div>' +
            (esc_item.resolution ? '<div class="admin-esc-resolution">' + esc(esc_item.resolution) + '</div>' : '') +
            (!esc_item.resolvedAt ? '<div class="admin-esc-actions" style="margin-top:0.5rem;display:flex;gap:0.4rem;flex-wrap:wrap;">' +
              '<select class="admin-select esc-resolution-select" data-eid="' + esc(esc_item.id) + '" style="padding:0.4rem;font-size:0.75rem;flex:1;min-width:120px;">' +
                '<option value="">Select resolution...</option>' +
                '<option value="resumed">Resumed Training</option>' +
                '<option value="paused_subscription">Paused Subscription</option>' +
                '<option value="churned">Churned</option>' +
                '<option value="call_completed">Call Completed</option>' +
                '<option value="other">Other</option>' +
              '</select>' +
              '<button class="admin-btn-primary admin-btn-small esc-resolve-btn" data-eid="' + esc(esc_item.id) + '" style="background:#22c55e;border-color:#22c55e;padding:0.4rem 0.8rem;font-size:0.75rem;">Resolve</button>' +
            '</div>' : '') +
            '</div>';
        }
        listEl.innerHTML = html;

        // Bind resolve buttons
        listEl.querySelectorAll('.esc-resolve-btn').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var eid = btn.getAttribute('data-eid');
            var select = listEl.querySelector('.esc-resolution-select[data-eid="' + eid + '"]');
            var resolution = select ? select.value : '';
            if (!resolution) { alert('Select a resolution type first'); return; }
            btn.disabled = true; btn.textContent = '...';
            try {
              await apiPost('/api/v1/admin/escalations/' + encodeURIComponent(eid) + '/resolve', { resolution: resolution });
              loadEscalations();
            } catch (e) { alert('Failed: ' + e.message); btn.disabled = false; btn.textContent = 'Resolve'; }
          });
        });
      }

      renderPagination('escalationsPagination', escalationsPage, escalationsTotalPages, function (pg) {
        escalationsPage = pg;
        loadEscalations();
      });

    } catch (err) {
      document.getElementById('escalationsList').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
    }
  }

  /* ============================================================
     UPCOMING CALLS TAB
     ============================================================ */

  function fmtCallDate(dateStr, timeStr) {
    var parts = (dateStr || '').split('-');
    if (parts.length !== 3) return esc(dateStr) + ' ' + esc(timeStr);
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    var dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    var timeParts = (timeStr || '').split(':');
    var hour = parseInt(timeParts[0], 10) || 0;
    var minute = timeParts[1] || '00';
    var ampm = hour >= 12 ? 'PM' : 'AM';
    var hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return dayLabel + ' at ' + hour12 + ':' + minute + ' ' + ampm;
  }

  async function loadUpcomingCalls() {
    var listEl = document.getElementById('upcomingCallsList');
    try {
      var res = await apiGet('/api/v1/admin/upcoming-calls');
      var calls = res.data.calls;

      if (!calls || !calls.length) {
        listEl.innerHTML = '<div class="admin-empty">No upcoming calls</div>';
        return;
      }

      var html = '';
      for (var i = 0; i < calls.length; i++) {
        var call = calls[i];
        var badgeBaseStyle = 'display:inline-block;padding:0.1rem 0.5rem;border-radius:3px;font-size:0.7rem;font-weight:600;margin-left:0.4rem;vertical-align:middle;';
        var kindBadge = call.kind === 'PAID_SESSION'
          ? '<span style="' + badgeBaseStyle + 'background:rgba(34,197,94,0.15);color:#22c55e;">Paid</span>'
          : '<span style="' + badgeBaseStyle + 'background:rgba(156,163,175,0.15);color:#9ca3af;">Free Consult</span>';

        var intakeHtml = '';
        if (call.intake) {
          var intake = call.intake;
          intakeHtml = '<div class="admin-esc-resolution" style="margin-top:0.6rem;">' +
            '<strong>Survey on file:</strong><br>' +
            (intake.aiSummary ? esc(intake.aiSummary) + '<br>' : '') +
            'Goal: ' + esc(intake.primaryGoal) + ' &middot; Experience: ' + esc(intake.experienceLevel) +
            ' &middot; Trains ' + esc(String(intake.trainingDaysPerWeek)) + 'x/week &middot; Equipment: ' + esc(intake.equipmentAccess) +
            (intake.injuryHistory ? '<br>Injury history: ' + esc(intake.injuryHistory) : '') +
            (intake.riskFlags && intake.riskFlags.length ? '<br><span style="color:#f87171;">Risk flags: ' + esc(intake.riskFlags.join(', ')) + '</span>' : '') +
            '</div>';
        } else {
          intakeHtml = '<div class="admin-esc-meta" style="margin-top:0.6rem;"><span>No survey on file for this email yet</span></div>';
        }

        html += '<div class="admin-esc-card">' +
          '<div class="admin-esc-card-header">' +
          '<span class="admin-esc-client">' + esc(call.name) + ' ' + kindBadge + '</span>' +
          '<span class="admin-esc-date">' + esc(fmtCallDate(call.date, call.time)) + '</span>' +
          '</div>' +
          '<div class="admin-esc-meta">' +
          '<span>' + esc(call.label) + '</span>' +
          '<span>' + esc(call.email) + '</span>' +
          (call.phone ? '<span>' + esc(call.phone) + '</span>' : '') +
          (call.meetingPreference ? '<span>Via: ' + esc(call.meetingPreference) + '</span>' : '') +
          '</div>' +
          (call.meetLink ? '<div class="admin-esc-meta"><span><a href="' + esc(call.meetLink) + '" target="_blank" rel="noopener noreferrer">' + esc(call.meetLink) + '</a></span></div>' : '') +
          (call.notes ? '<div class="admin-esc-reason">' + esc(call.notes) + '</div>' : '') +
          intakeHtml +
          '</div>';
      }
      listEl.innerHTML = html;
    } catch (err) {
      listEl.innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
    }
  }

  /* ============================================================
     CRM TAB — every survey response + contact/consultation lead
     ============================================================ */

  var crmSearchInput = document.getElementById('crmSearch');
  if (crmSearchInput) {
    crmSearchInput.addEventListener('input', debounce(function () {
      crmPage = 1;
      loadCrm();
    }, 300));
  }

  function crmKindBadge(kind) {
    var badgeBaseStyle = 'display:inline-block;padding:0.1rem 0.5rem;border-radius:3px;font-size:0.7rem;font-weight:600;margin-left:0.4rem;vertical-align:middle;';
    if (kind === 'CONSULTATION') return '<span style="' + badgeBaseStyle + 'background:rgba(156,163,175,0.15);color:#9ca3af;">Free Consult</span>';
    if (kind === 'CONTACT') return '<span style="' + badgeBaseStyle + 'background:rgba(59,130,246,0.15);color:#3b82f6;">Contact Form</span>';
    return '<span style="' + badgeBaseStyle + 'background:rgba(168,85,247,0.15);color:#a855f7;">Survey</span>';
  }

  async function loadCrm() {
    var listEl = document.getElementById('crmList');
    var params = '?page=' + crmPage + '&limit=25';
    var search = crmSearchInput ? crmSearchInput.value.trim() : '';
    if (search) params += '&search=' + encodeURIComponent(search);

    try {
      var res = await apiGet('/api/v1/admin/crm' + params);
      var data = res.data;
      crmTotalPages = data.totalPages;

      if (!data.entries || !data.entries.length) {
        listEl.innerHTML = '<div class="admin-empty">No CRM entries found</div>';
        renderPagination('crmPagination', crmPage, crmTotalPages, function (pg) { crmPage = pg; loadCrm(); });
        return;
      }

      var html = '';
      for (var i = 0; i < data.entries.length; i++) {
        var entry = data.entries[i];
        html += '<div class="admin-esc-card">' +
          '<div class="admin-esc-card-header">' +
          '<span class="admin-esc-client">' + esc(entry.name || '—') + crmKindBadge(entry.kind) + '</span>' +
          '<span class="admin-esc-date">' + fmtDate(entry.createdAt) + '</span>' +
          '</div>' +
          '<div class="admin-esc-meta">' +
          '<span>' + esc(entry.email) + '</span>' +
          (entry.phone ? '<span>' + esc(entry.phone) + '</span>' : '') +
          '<span>' + statusBadge(entry.status) + '</span>' +
          (entry.freeConsultUsed ? '<span style="color:#f59e0b;">Free consult used</span>' : '<span style="color:#22c55e;">Free consult available</span>') +
          '</div>' +
          (entry.primaryGoal ? '<div class="admin-esc-meta"><span>Goal: ' + esc(entry.primaryGoal) + '</span>' + (entry.experienceLevel ? '<span>Experience: ' + esc(entry.experienceLevel) + '</span>' : '') + '</div>' : '') +
          (entry.notes ? '<div class="admin-esc-reason">' + esc(entry.notes) + '</div>' : '') +
          '</div>';
      }
      listEl.innerHTML = html;
      renderPagination('crmPagination', crmPage, crmTotalPages, function (pg) { crmPage = pg; loadCrm(); });
    } catch (err) {
      listEl.innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
    }
  }

  /* ============================================================
     EXERCISE VIDEOS TAB — generate/approve/reject "show me how" demos
     ============================================================ */

  var videoFilterBtns = document.querySelectorAll('.video-filter-btn');
  videoFilterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      videoFilterBtns.forEach(function (b) { b.classList.remove('admin-filter-btn--active'); });
      btn.classList.add('admin-filter-btn--active');
      videoFilter = btn.getAttribute('data-video-filter');
      loadExerciseVideos();
    });
  });

  var videoGenerateBtn = document.getElementById('videoGenerateBtn');
  if (videoGenerateBtn) {
    videoGenerateBtn.addEventListener('click', async function () {
      var select = document.getElementById('videoExerciseSelect');
      var statusEl = document.getElementById('videoGenerateStatus');
      var exerciseName = select ? select.value : '';
      if (!exerciseName) return;

      videoGenerateBtn.disabled = true;
      statusEl.innerHTML = '<div class="admin-empty">Submitting to Runway…</div>';
      try {
        await apiPost('/api/v1/admin/exercise-videos/' + encodeURIComponent(exerciseName) + '/generate', {});
        statusEl.innerHTML = '<div class="admin-alert admin-alert--success">Generation started for "' + esc(exerciseName) + '". Use "Check Pending" in a minute or two to see if it\'s ready for review.</div>';
        loadExerciseVideos();
      } catch (err) {
        statusEl.innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
      } finally {
        videoGenerateBtn.disabled = false;
      }
    });
  }

  var videoPollBtn = document.getElementById('videoPollBtn');
  if (videoPollBtn) {
    videoPollBtn.addEventListener('click', async function () {
      var statusEl = document.getElementById('videoGenerateStatus');
      videoPollBtn.disabled = true;
      statusEl.innerHTML = '<div class="admin-empty">Checking Runway for updates…</div>';
      try {
        var res = await apiPost('/api/v1/admin/exercise-videos/poll', {});
        var updated = res.data || [];
        statusEl.innerHTML = updated.length
          ? '<div class="admin-alert admin-alert--success">' + updated.length + ' video(s) updated.</div>'
          : '<div class="admin-empty">No pending generations finished yet.</div>';
        loadExerciseVideos();
      } catch (err) {
        statusEl.innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
      } finally {
        videoPollBtn.disabled = false;
      }
    });
  }

  function videoStatusBadge(status) {
    var badgeBaseStyle = 'display:inline-block;padding:0.1rem 0.5rem;border-radius:3px;font-size:0.7rem;font-weight:600;margin-left:0.4rem;vertical-align:middle;';
    var map = {
      GENERATING: 'background:rgba(245,158,11,0.15);color:#f59e0b;',
      NEEDS_REVIEW: 'background:rgba(59,130,246,0.15);color:#3b82f6;',
      APPROVED: 'background:rgba(34,197,94,0.15);color:#22c55e;',
      REJECTED: 'background:rgba(156,163,175,0.15);color:#9ca3af;',
      FAILED: 'background:rgba(248,113,113,0.15);color:#f87171;'
    };
    return '<span style="' + badgeBaseStyle + (map[status] || '') + '">' + esc(status.replace(/_/g, ' ')) + '</span>';
  }

  async function loadExerciseVideos() {
    var listEl = document.getElementById('exerciseVideosList');
    var select = document.getElementById('videoExerciseSelect');

    try {
      if (select && !select.options.length) {
        var starterRes = await apiGet('/api/v1/admin/exercise-videos/starter-list');
        var exercises = starterRes.data.exercises || [];
        select.innerHTML = exercises.map(function (name) {
          return '<option value="' + esc(name) + '">' + esc(name) + '</option>';
        }).join('');
      }

      var params = videoFilter !== 'all' ? '?status=' + encodeURIComponent(videoFilter) : '';
      var res = await apiGet('/api/v1/admin/exercise-videos' + params);
      var videos = res.data || [];

      var badge = document.getElementById('videoReviewBadge');
      if (badge) {
        var needsReview = videos.filter(function (v) { return v.status === 'NEEDS_REVIEW'; }).length;
        if (videoFilter === 'all' && needsReview > 0) {
          badge.textContent = needsReview;
          badge.style.display = '';
        } else if (videoFilter === 'all') {
          badge.style.display = 'none';
        }
      }

      if (!videos.length) {
        listEl.innerHTML = '<div class="admin-empty">No exercise videos yet — generate one above</div>';
        return;
      }

      var html = '';
      for (var i = 0; i < videos.length; i++) {
        var v = videos[i];
        html += '<div class="admin-esc-card">' +
          '<div class="admin-esc-card-header">' +
          '<span class="admin-esc-client">' + esc(v.exerciseName) + videoStatusBadge(v.status) + '</span>' +
          '<span class="admin-esc-date">' + fmtDateTime(v.updatedAt) + '</span>' +
          '</div>';

        if (v.videoUrl) {
          html += '<div style="margin:0.6rem 0;"><video src="' + esc(v.videoUrl) + '" controls preload="metadata" style="max-width:320px;border-radius:6px;display:block;"></video></div>';
        }

        if (v.status === 'FAILED' && v.rejectionNote) {
          html += '<div class="admin-esc-reason">Failure reason: ' + esc(v.rejectionNote) + '</div>';
        }
        if (v.status === 'REJECTED' && v.rejectionNote) {
          html += '<div class="admin-esc-reason">Rejected: ' + esc(v.rejectionNote) + '</div>';
        }

        html += '<div class="admin-esc-meta" style="gap:0.5rem;">';
        if (v.status === 'NEEDS_REVIEW') {
          html += '<button class="admin-btn-primary video-approve-btn" data-id="' + esc(v.id) + '" type="button" style="padding:0.35rem 0.9rem;font-size:0.8rem;">Approve</button>';
          html += '<button class="admin-btn-secondary video-reject-btn" data-id="' + esc(v.id) + '" type="button" style="padding:0.35rem 0.9rem;font-size:0.8rem;">Reject</button>';
        }
        if (v.status === 'REJECTED' || v.status === 'FAILED') {
          html += '<button class="admin-btn-secondary video-regenerate-btn" data-id="' + esc(v.id) + '" type="button" style="padding:0.35rem 0.9rem;font-size:0.8rem;">Regenerate</button>';
        }
        html += '</div></div>';
      }
      listEl.innerHTML = html;

      listEl.querySelectorAll('.video-approve-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          btn.disabled = true;
          try {
            await apiPost('/api/v1/admin/exercise-videos/' + btn.getAttribute('data-id') + '/approve', {});
            loadExerciseVideos();
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
          }
        });
      });

      listEl.querySelectorAll('.video-reject-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var note = prompt('Why is this rejected? (helps whoever regenerates it)');
          if (!note) return;
          btn.disabled = true;
          try {
            await apiPost('/api/v1/admin/exercise-videos/' + btn.getAttribute('data-id') + '/reject', { note: note });
            loadExerciseVideos();
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
          }
        });
      });

      listEl.querySelectorAll('.video-regenerate-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          btn.disabled = true;
          try {
            await apiPost('/api/v1/admin/exercise-videos/' + btn.getAttribute('data-id') + '/regenerate', {});
            loadExerciseVideos();
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      listEl.innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
    }
  }

  /* ============================================================
     ACTION QUEUE TAB
     ============================================================ */

  async function loadActionQueue() {
    try {
      // Load triggers and action queue in parallel
      var results = await Promise.all([
        apiGet('/api/v1/admin/triggers'),
        apiGet('/api/v1/admin/action-queue')
      ]);
      var triggers = (results[0].data && results[0].data.triggers) || [];
      var d = results[1].data || {};
      d.pendingApprovals = d.pendingApprovals || [];
      d.endingSoon = d.endingSoon || [];
      d.completedPlans = d.completedPlans || [];
      d.unresolvedEscalations = d.unresolvedEscalations || [];

      // Message Triggers
      var tEl = document.getElementById('aqTriggers');
      var triggerCountEl = document.getElementById('triggerCount');
      if (triggers.length === 0) {
        tEl.innerHTML = '<div class="admin-empty">No pending message triggers</div>';
        triggerCountEl.textContent = '';
      } else {
        triggerCountEl.textContent = '(' + triggers.length + ')';
        var tHtml = '';
        for (var t = 0; t < triggers.length; t++) {
          var tr = triggers[t];
          var tName = tr.user && tr.user.athleteProfile ? esc(tr.user.athleteProfile.firstName || '') + ' ' + esc(tr.user.athleteProfile.lastName || '') : (tr.user ? esc(tr.user.email) : '—');
          tHtml += '<div class="admin-action-card">' +
            '<div class="admin-action-info">' +
              '<strong>' + tName.trim() + '</strong>' +
              '<div class="admin-action-meta">' +
                '<span class="admin-badge">' + esc(tr.category) + '</span> ' +
                '<span class="admin-badge">' + esc(tr.channel) + '</span> &middot; ' +
                fmtDateTime(tr.sentAt) +
              '</div>' +
              '<div style="color:rgba(192,192,192,0.6);font-size:0.8rem;margin-top:0.3rem;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(tr.content) + '</div>' +
            '</div>' +
            '<div class="admin-action-btns">' +
              '<button class="admin-btn-primary admin-btn-small trigger-fire" data-tid="' + esc(tr.id) + '" style="background:#22c55e;border-color:#22c55e;">Send</button>' +
              '<button class="admin-btn-secondary admin-btn-small trigger-dismiss" data-tid="' + esc(tr.id) + '" style="border-color:rgba(192,192,192,0.3);color:rgba(192,192,192,0.5);">Dismiss</button>' +
            '</div>' +
          '</div>';
        }
        tEl.innerHTML = tHtml;
        // Bind fire buttons
        tEl.querySelectorAll('.trigger-fire').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var tid = btn.getAttribute('data-tid');
            if (!confirm('Send this message now?')) return;
            btn.disabled = true; btn.textContent = 'Sending...';
            try {
              await apiPost('/api/v1/admin/triggers/' + encodeURIComponent(tid) + '/fire');
              loadActionQueue();
            } catch (e) { alert('Failed: ' + e.message); btn.disabled = false; btn.textContent = 'Send'; }
          });
        });
        // Bind dismiss buttons
        tEl.querySelectorAll('.trigger-dismiss').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var tid = btn.getAttribute('data-tid');
            btn.disabled = true; btn.textContent = '...';
            try {
              await apiPost('/api/v1/admin/triggers/' + encodeURIComponent(tid) + '/dismiss');
              loadActionQueue();
            } catch (e) { alert('Failed: ' + e.message); btn.disabled = false; btn.textContent = 'Dismiss'; }
          });
        });
      }

      // Pending Approvals
      var paEl = document.getElementById('aqPendingApprovals');
      if (d.pendingApprovals.length === 0) {
        paEl.innerHTML = '<div class="admin-empty">No pending approvals</div>';
      } else {
        var html = '';
        for (var i = 0; i < d.pendingApprovals.length; i++) {
          var pa = d.pendingApprovals[i];
          var name = pa.athleteProfile ? esc(pa.athleteProfile.firstName || '') + ' ' + esc(pa.athleteProfile.lastName || '') : esc(pa.email);
          var tier = pa.subscription ? esc(fmtTier(pa.subscription.planTier)) : '—';
          html += '<div class="admin-action-card">' +
            '<div class="admin-action-info">' +
              '<strong>' + name.trim() + '</strong> — ' + tier +
              '<div class="admin-action-meta">' + esc(pa.email) + ' &middot; Signed up ' + fmtDate(pa.createdAt) + '</div>' +
            '</div>' +
            '<div class="admin-action-btns">' +
              '<button class="admin-btn-primary admin-btn-small aq-approve" data-uid="' + esc(pa.id) + '" style="background:#22c55e;border-color:#22c55e;">Approve</button>' +
              '<button class="admin-btn-secondary admin-btn-small aq-reject" data-uid="' + esc(pa.id) + '" style="border-color:#ef4444;color:#ef4444;">Reject</button>' +
            '</div>' +
          '</div>';
        }
        paEl.innerHTML = html;
        // Bind approve/reject
        paEl.querySelectorAll('.aq-approve').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var uid = btn.getAttribute('data-uid');
            if (!confirm('Approve this client?')) return;
            btn.disabled = true; btn.textContent = '...';
            try {
              await apiPut('/api/v1/admin/clients/' + encodeURIComponent(uid) + '/status', { action: 'approve' });
              loadActionQueue(); loadPendingCount();
            } catch (e) { alert('Failed: ' + e.message); btn.disabled = false; btn.textContent = 'Approve'; }
          });
        });
        paEl.querySelectorAll('.aq-reject').forEach(function (btn) {
          btn.addEventListener('click', async function () {
            var uid = btn.getAttribute('data-uid');
            if (!confirm('Reject this client?')) return;
            btn.disabled = true; btn.textContent = '...';
            try {
              await apiPut('/api/v1/admin/clients/' + encodeURIComponent(uid) + '/status', { action: 'reject' });
              loadActionQueue(); loadPendingCount();
            } catch (e) { alert('Failed: ' + e.message); btn.disabled = false; btn.textContent = 'Reject'; }
          });
        });
      }

      // Update action badge
      var totalActions = triggers.length + d.pendingApprovals.length + d.completedPlans.length + d.unresolvedEscalations.length;
      var actionBadge = document.getElementById('actionBadge');
      if (totalActions > 0) { actionBadge.textContent = totalActions; actionBadge.style.display = 'inline-flex'; }
      else { actionBadge.style.display = 'none'; }

      // Ending Soon
      var esEl = document.getElementById('aqEndingSoon');
      if (d.endingSoon.length === 0) {
        esEl.innerHTML = '<div class="admin-empty">No plans ending this week</div>';
      } else {
        var html2 = '';
        for (var j = 0; j < d.endingSoon.length; j++) {
          var es = d.endingSoon[j];
          var esName = es.athleteProfile ? esc(es.athleteProfile.firstName || '') + ' ' + esc(es.athleteProfile.lastName || '') : esc(es.email);
          var esTier = es.subscription ? esc(fmtTier(es.subscription.planTier)) : '—';
          html2 += '<div class="admin-action-card">' +
            '<div class="admin-action-info">' +
              '<strong>' + esName.trim() + '</strong> — ' + esTier +
              '<div class="admin-action-meta">' + es.daysRemaining + ' day' + (es.daysRemaining !== 1 ? 's' : '') + ' remaining</div>' +
            '</div>' +
            '<div class="admin-action-btns">' +
              '<button class="admin-btn-secondary admin-btn-small aq-view-client" data-uid="' + esc(es.id) + '">View</button>' +
            '</div>' +
          '</div>';
        }
        esEl.innerHTML = html2;
      }

      // Completed Plans
      var cpEl = document.getElementById('aqCompletedPlans');
      if (d.completedPlans.length === 0) {
        cpEl.innerHTML = '<div class="admin-empty">No completed plans awaiting response</div>';
      } else {
        var html3 = '';
        for (var k = 0; k < d.completedPlans.length; k++) {
          var cp = d.completedPlans[k];
          var cpName = cp.athleteProfile ? esc(cp.athleteProfile.firstName || '') + ' ' + esc(cp.athleteProfile.lastName || '') : esc(cp.email);
          var cpTier = cp.subscription ? esc(fmtTier(cp.subscription.planTier)) : '—';
          var deleteIn = cp.daysUntilDelete != null ? cp.daysUntilDelete + 'd until auto-deactivate' : '—';
          html3 += '<div class="admin-action-card">' +
            '<div class="admin-action-info">' +
              '<strong>' + cpName.trim() + '</strong> — ' + cpTier +
              '<div class="admin-action-meta">Ended ' + fmtDate(cp.subscription ? cp.subscription.currentPeriodEnd : null) + ' &middot; ' + deleteIn + '</div>' +
            '</div>' +
            '<div class="admin-action-btns">' +
              '<button class="admin-btn-secondary admin-btn-small aq-view-client" data-uid="' + esc(cp.id) + '">Contact</button>' +
            '</div>' +
          '</div>';
        }
        cpEl.innerHTML = html3;
      }

      // Unresolved Escalations
      var ueEl = document.getElementById('aqEscalations');
      if (d.unresolvedEscalations.length === 0) {
        ueEl.innerHTML = '<div class="admin-empty">No unresolved escalations</div>';
      } else {
        var html4 = '';
        for (var m = 0; m < d.unresolvedEscalations.length; m++) {
          var ue = d.unresolvedEscalations[m];
          var ueName = ue.user && ue.user.athleteProfile ? esc(ue.user.athleteProfile.firstName || '') + ' ' + esc(ue.user.athleteProfile.lastName || '') : (ue.user ? esc(ue.user.email) : '—');
          html4 += '<div class="admin-action-card">' +
            '<div class="admin-action-info">' +
              '<strong>' + ueName.trim() + '</strong> — Level ' + ue.escalationLevel +
              '<div class="admin-action-meta">' + esc(ue.triggerReason) + ' &middot; ' + fmtDate(ue.createdAt) + '</div>' +
            '</div>' +
          '</div>';
        }
        ueEl.innerHTML = html4;
      }

      // Bind view/contact buttons across all action queue sections
      document.querySelectorAll('.aq-view-client').forEach(function (btn) {
        btn.addEventListener('click', function () {
          openClientDetail(btn.getAttribute('data-uid'));
        });
      });

    } catch (err) {
      document.getElementById('aqPendingApprovals').innerHTML = '<div class="admin-alert admin-alert--error">' + esc(err.message) + '</div>';
    }
  }

  /* ============================================================
     MESSAGING TAB
     ============================================================ */

  var msgPage = 1;
  var msgTotalPages = 1;

  // Bind messaging filters
  var msgSearchEl = document.getElementById('msgSearch');
  var msgCatFilter = document.getElementById('msgCategoryFilter');
  var msgStatusFilter = document.getElementById('msgStatusFilter');
  if (msgSearchEl) {
    msgSearchEl.addEventListener('input', debounce(function () { msgPage = 1; loadMessaging(); }, 300));
    msgCatFilter.addEventListener('change', function () { msgPage = 1; loadMessaging(); });
    msgStatusFilter.addEventListener('change', function () { msgPage = 1; loadMessaging(); });
  }

  async function loadMessaging() {
    try {
      var params = '?page=' + msgPage + '&limit=50';
      var search = msgSearchEl ? msgSearchEl.value.trim() : '';
      if (search) params += '&search=' + encodeURIComponent(search);
      var cat = msgCatFilter ? msgCatFilter.value : '';
      if (cat) params += '&category=' + encodeURIComponent(cat);
      var st = msgStatusFilter ? msgStatusFilter.value : '';
      if (st) params += '&status=' + encodeURIComponent(st);

      var res = await apiGet('/api/v1/admin/messages' + params);
      var d = res.data || {};
      var stats = d.stats || { totalToday: 0, deliveredToday: 0, failedToday: 0, deliveryRate: 100 };
      var messages = d.messages || [];
      msgTotalPages = d.totalPages || 1;

      // Stats bar
      var statsEl = document.getElementById('msgStats');
      statsEl.innerHTML =
        '<div class="admin-kpi-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:1rem;">' +
          '<div class="admin-kpi"><span class="admin-kpi-label">Sent Today</span><span class="admin-kpi-value">' + stats.totalToday + '</span></div>' +
          '<div class="admin-kpi"><span class="admin-kpi-label">Delivered</span><span class="admin-kpi-value" style="color:#4ade80;">' + stats.deliveredToday + '</span></div>' +
          '<div class="admin-kpi"><span class="admin-kpi-label">Failed</span><span class="admin-kpi-value" style="color:' + (stats.failedToday > 0 ? '#f87171' : '#4ade80') + ';">' + stats.failedToday + '</span></div>' +
          '<div class="admin-kpi"><span class="admin-kpi-label">Delivery Rate</span><span class="admin-kpi-value">' + stats.deliveryRate + '%</span></div>' +
        '</div>';

      // Messages table
      var body = document.getElementById('msgBody');
      if (!messages.length) {
        body.innerHTML = '<tr><td colspan="6" class="admin-empty">No messages today</td></tr>';
      } else {
        var html = '';
        for (var i = 0; i < messages.length; i++) {
          var m = messages[i];
          var mName = m.user && m.user.athleteProfile ? esc(m.user.athleteProfile.firstName || '') + ' ' + esc(m.user.athleteProfile.lastName || '') : (m.user ? esc(m.user.email) : '—');
          var failed = m.failedAt ? true : false;
          var statusCls = failed ? 'admin-badge--canceled' : 'admin-badge--active';
          var statusTxt = failed ? 'Failed' : 'Sent';
          var contentPreview = esc((m.content || '').substring(0, 80)) + ((m.content || '').length > 80 ? '...' : '');
          html += '<tr class="admin-table-clickable" data-userid="' + esc(m.userId) + '">' +
            '<td>' + mName.trim() + '</td>' +
            '<td><span class="admin-badge">' + esc(m.channel) + '</span></td>' +
            '<td>' + esc(m.category) + '</td>' +
            '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + contentPreview + '</td>' +
            '<td>' + fmtDateTime(m.sentAt) + '</td>' +
            '<td><span class="admin-badge ' + statusCls + '">' + statusTxt + '</span></td>' +
          '</tr>';
        }
        body.innerHTML = html;
        // Click to open client detail
        body.querySelectorAll('.admin-table-clickable').forEach(function (row) {
          row.addEventListener('click', function () {
            openClientDetail(row.getAttribute('data-userid'));
          });
        });
      }

      // Pagination
      renderPagination('msgPagination', msgPage, msgTotalPages, function (pg) {
        msgPage = pg;
        loadMessaging();
      });
    } catch (err) {
      document.getElementById('msgBody').innerHTML = '<tr><td colspan="6" class="admin-alert admin-alert--error">' + esc(err.message) + '</td></tr>';
    }
  }

  /* ── Pending Approval Badge ── */
  async function loadPendingCount() {
    try {
      var res = await apiGet('/api/v1/admin/pending-count');
      var count = res.data.count;
      var badge = document.getElementById('pendingBadge');
      if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    } catch (e) { /* ignore */ }
  }

  /* ── Init: show loading shimmers + load overview + pending count on page load ── */
  // Pre-fill client table with loading state
  var clientsBody = document.getElementById('clientsBody');
  if (clientsBody && !clientsBody.innerHTML.trim()) {
    clientsBody.innerHTML = '<tr><td colspan="7"><div class="admin-loading" style="height:24px;margin:0.5rem 0;"></div><div class="admin-loading" style="height:24px;margin:0.5rem 0;"></div><div class="admin-loading" style="height:24px;margin:0.5rem 0;"></div></td></tr>';
  }

  loadTab('command');
  loadPendingCount();

})();

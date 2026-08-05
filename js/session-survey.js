/**
 * Vintus Performance — Paid Session Survey (gate before scheduling)
 * Collects contact info + session-specific intake questions, stores them
 * in sessionStorage, then hands off to /paid-session?type=X for calendar
 * + payment. No backend call here — the actual SessionBooking is created
 * on the calendar page once a date/time is picked.
 */

(function () {
    'use strict';

    var CATALOG = {
        'THIRTY_MIN': { label: '30-Minute Meeting', kind: 'general' },
        'SIXTY_MIN_1ON1': { label: '60-Min Training Session — 1-on-1', kind: 'training' },
        'SIXTY_MIN_1ON2': { label: '60-Min Training Session — 1-on-2', kind: 'training' },
        'SIXTY_MIN_GROUP': { label: '60-Min Training Session — Group', kind: 'training' }
    };

    var params = new URLSearchParams(window.location.search);
    var sessionType = params.get('type');
    var catalogEntry = CATALOG[sessionType];

    if (!catalogEntry) {
        window.location.href = '/features#coaching';
        return;
    }

    var isTraining = catalogEntry.kind === 'training';

    var errorEl = document.getElementById('onboardError');
    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function hideError() {
        errorEl.style.display = 'none';
    }

    document.getElementById('surveyTitle').textContent = 'Tell Us About Your ' + catalogEntry.label;
    document.getElementById('surveySubtitle').textContent = isTraining
        ? 'A few questions about the session so your coach can plan the workout before you get to scheduling.'
        : 'A few questions so your coach can prep before you get to scheduling.';

    document.getElementById('generalQuestions').style.display = isTraining ? 'none' : 'block';
    document.getElementById('trainingQuestions').style.display = isTraining ? 'block' : 'none';

    function val(id) { return document.getElementById(id).value.trim(); }

    var STORAGE_KEY = 'vintus_session_survey:' + sessionType;

    var btn = document.getElementById('surveyContinueBtn');
    btn.addEventListener('click', function () {
        hideError();

        var firstName = val('firstName');
        var email = val('email');
        var phone = val('phone');
        var meetingPreference = val('meetingPreference');

        if (!firstName || !email || !phone || !meetingPreference) {
            showError('Please fill out your name, email, phone, and how we should connect.');
            return;
        }

        var coachingContext;

        if (isTraining) {
            var sessionFocus = val('sessionFocus');
            var experienceLevel = val('experienceLevel');
            var equipmentAccess = val('equipmentAccess');

            if (!sessionFocus || !experienceLevel || !equipmentAccess) {
                showError('Please answer the session focus, experience level, and equipment questions.');
                return;
            }

            var injuries = val('injuries');
            var sessionNotes = val('sessionNotes');

            var trainingLines = [
                'Session focus: ' + sessionFocus,
                'Experience level: ' + experienceLevel,
                'Equipment access: ' + equipmentAccess,
                'Injuries/limitations: ' + (injuries || 'None noted')
            ];
            if (sessionNotes) trainingLines.push('', 'Additional notes: ' + sessionNotes);
            coachingContext = trainingLines.join('\n');
        } else {
            var callPurpose = val('callPurpose');
            if (!callPurpose) {
                showError('Please let us know what this call is primarily about.');
                return;
            }

            var focusNotes = val('focusNotes');
            var generalLines = ['Call purpose: ' + callPurpose];
            if (focusNotes) generalLines.push('', focusNotes);
            coachingContext = generalLines.join('\n');
        }

        var surveyData = {
            firstName: firstName,
            lastName: val('lastName') || undefined,
            email: email,
            phone: phone,
            meetingPreference: meetingPreference,
            coachingContext: coachingContext
        };

        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(surveyData));
        } catch (err) {
            // Storage unavailable (private browsing, etc.) — fall through and
            // let the scheduling page's own missing-survey guard catch it.
        }

        window.location.href = '/paid-session?type=' + sessionType;
    });
})();

/**
 * Vintus Performance — Paid Session Booking
 * Survey + calendar (shared availability with /book) + Stripe Checkout handoff.
 */

(function () {
    'use strict';

    // ====================================
    // Session catalog — display only. Server recomputes price and revalidates
    // headcount bounds; this mirrors it just so the page shows the right numbers.
    // ====================================
    var CATALOG = {
        'THIRTY_MIN': { label: '30-Minute Meeting', duration: 30, perPersonCents: 8500, min: 1, max: 6 },
        'SIXTY_MIN_1ON1': { label: '60-Min Training Session — 1-on-1', duration: 60, perPersonCents: 15000, min: 1, max: 1 },
        'SIXTY_MIN_1ON2': { label: '60-Min Training Session — 1-on-2', duration: 60, perPersonCents: 11000, min: 1, max: 2 },
        'SIXTY_MIN_GROUP': { label: '60-Min Training Session — Group', duration: 60, perPersonCents: 6500, min: 3, max: 6 }
    };

    var params = new URLSearchParams(window.location.search);
    var sessionType = params.get('type');
    var catalogEntry = CATALOG[sessionType];

    if (!catalogEntry) {
        window.location.href = '/features#coaching';
        return;
    }

    var CONFIG = {
        availableHours: [9, 10, 11, 13, 14, 15, 16, 17, 18],
        availableDays: [1, 2, 3, 4, 5],
        maxAdvanceDays: 30,
        minNoticeHours: 24
    };

    var state = {
        currentMonth: new Date().getMonth(),
        currentYear: new Date().getFullYear(),
        selectedDate: null,
        selectedTime: null,
        bookedSlots: {},
        headcount: catalogEntry.min,
        isLoading: false
    };

    var elements = {
        calendarGrid: document.getElementById('calendarGrid'),
        currentMonth: document.getElementById('currentMonth'),
        prevMonth: document.getElementById('prevMonth'),
        nextMonth: document.getElementById('nextMonth'),
        timeSlotsWrapper: document.getElementById('timeSlotsWrapper'),
        timeSlotsGrid: document.getElementById('timeSlotsGrid'),
        selectedDateDisplay: document.getElementById('selectedDateDisplay'),
        summaryDate: document.getElementById('summaryDate'),
        summaryTime: document.getElementById('summaryTime'),
        summaryDuration: document.getElementById('summaryDuration'),
        summaryPrice: document.getElementById('summaryPrice'),
        summarySessionLabel: document.getElementById('summarySessionLabel'),
        headcountDetail: document.getElementById('headcountDetail'),
        headcountValue: document.getElementById('headcountValue'),
        headcountMinus: document.getElementById('headcountMinus'),
        headcountPlus: document.getElementById('headcountPlus'),
        bookingForm: document.getElementById('bookingForm'),
        bookingSubmit: document.getElementById('bookingSubmit'),
        bookingError: document.getElementById('bookingError'),
        calendarLoading: document.getElementById('calendarLoading')
    };

    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    function formatDate(date) {
        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }

    function formatTime(hour, minute) {
        var period = hour >= 12 ? 'PM' : 'AM';
        var displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
        var displayMinute = String(minute).padStart(2, '0');
        return displayHour + ':' + displayMinute + ' ' + period;
    }

    function getDateKey(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function isToday(date) {
        var today = new Date();
        return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
    }

    function isPastDate(date) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        return date < today;
    }

    function isWithinBookingWindow(date) {
        var today = new Date();
        var maxDate = new Date();
        maxDate.setDate(today.getDate() + CONFIG.maxAdvanceDays);
        return date <= maxDate;
    }

    function formatPriceCents(cents) {
        return '$' + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
    }

    // ====================================
    // Session header + summary
    // ====================================
    function renderSessionInfo() {
        document.getElementById('sessionTitle').textContent = catalogEntry.label;
        document.getElementById('sessionSubtitle').textContent =
            catalogEntry.duration + '-minute session. Pick a time, tell us how we can help, and confirm with secure checkout.';
        elements.summarySessionLabel.textContent = catalogEntry.label;
        elements.summaryDuration.textContent = catalogEntry.duration + ' minutes';

        if (catalogEntry.max > 1) {
            elements.headcountDetail.style.display = 'flex';
            elements.headcountMinus.disabled = state.headcount <= catalogEntry.min;
            elements.headcountPlus.disabled = state.headcount >= catalogEntry.max;
        }

        updatePrice();
    }

    function updatePrice() {
        var total = catalogEntry.perPersonCents * state.headcount;
        var perPersonNote = catalogEntry.max > 1 ? ' <span>(' + formatPriceCents(catalogEntry.perPersonCents) + '/person &times; ' + state.headcount + ')</span>' : '';
        elements.summaryPrice.innerHTML = formatPriceCents(total) + perPersonNote;
        elements.headcountValue.textContent = state.headcount;
    }

    elements.headcountMinus.addEventListener('click', function () {
        if (state.headcount > catalogEntry.min) {
            state.headcount--;
            elements.headcountPlus.disabled = false;
            if (state.headcount <= catalogEntry.min) elements.headcountMinus.disabled = true;
            updatePrice();
        }
    });
    elements.headcountPlus.addEventListener('click', function () {
        if (state.headcount < catalogEntry.max) {
            state.headcount++;
            elements.headcountMinus.disabled = false;
            if (state.headcount >= catalogEntry.max) elements.headcountPlus.disabled = true;
            updatePrice();
        }
    });

    // ====================================
    // Availability (shared with /book — same calendar, same conflicts)
    // ====================================
    async function fetchAvailability() {
        state.isLoading = true;
        showLoading(true);
        try {
            var apiUrl = (window.VINTUS_CONFIG && window.VINTUS_CONFIG.API_URL) || '';
            var response = await fetch(apiUrl + '/api/v1/leads/slots?month=' + (state.currentMonth + 1) + '&year=' + state.currentYear);
            if (response.ok) {
                var result = await response.json();
                state.bookedSlots = (result.data && result.data.bookedSlots) || {};
            } else {
                state.bookedSlots = {};
            }
        } catch (error) {
            state.bookedSlots = {};
        }
        state.isLoading = false;
        showLoading(false);
        renderCalendar();
    }

    function showLoading(show) {
        if (elements.calendarLoading) elements.calendarLoading.style.display = show ? 'flex' : 'none';
    }

    function renderCalendar() {
        if (!elements.calendarGrid) return;
        var headers = elements.calendarGrid.querySelectorAll('.calendar-day-header');
        elements.calendarGrid.innerHTML = '';
        headers.forEach(function (h) { elements.calendarGrid.appendChild(h); });

        elements.currentMonth.textContent = months[state.currentMonth] + ' ' + state.currentYear;

        var firstDay = new Date(state.currentYear, state.currentMonth, 1).getDay();
        var daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();

        for (var i = 0; i < firstDay; i++) {
            var emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day disabled';
            elements.calendarGrid.appendChild(emptyDay);
        }

        for (var day = 1; day <= daysInMonth; day++) {
            (function (day) {
                var date = new Date(state.currentYear, state.currentMonth, day);
                var dateKey = getDateKey(date);
                var dayElement = document.createElement('div');
                dayElement.className = 'calendar-day';
                dayElement.textContent = day;

                var isPast = isPastDate(date);
                var isAvailableDay = CONFIG.availableDays.includes(date.getDay());
                var isInWindow = isWithinBookingWindow(date);

                if (isPast) {
                    dayElement.classList.add('past');
                } else if (!isAvailableDay || !isInWindow) {
                    dayElement.classList.add('disabled');
                } else {
                    var bookedForDay = state.bookedSlots[dateKey] || [];
                    var totalSlots = CONFIG.availableHours.length * 2;
                    var availableSlots = totalSlots - bookedForDay.length;

                    if (availableSlots > 0) {
                        dayElement.classList.add('has-slots');
                        if (availableSlots <= 3) dayElement.classList.add('few-slots');
                        dayElement.addEventListener('click', function () { selectDate(date); });
                    } else {
                        dayElement.classList.add('disabled');
                    }
                }

                if (isToday(date)) dayElement.classList.add('today');
                if (state.selectedDate && getDateKey(state.selectedDate) === dateKey) dayElement.classList.add('selected');

                elements.calendarGrid.appendChild(dayElement);
            })(day);
        }
    }

    function renderTimeSlots() {
        if (!state.selectedDate || !elements.timeSlotsGrid) return;

        elements.timeSlotsWrapper.style.display = 'block';
        elements.selectedDateDisplay.textContent = formatDate(state.selectedDate);
        elements.timeSlotsGrid.innerHTML = '';

        var dateKey = getDateKey(state.selectedDate);
        var bookedTimes = state.bookedSlots[dateKey] || [];
        var now = new Date();
        var minBookingTime = new Date(now.getTime() + CONFIG.minNoticeHours * 60 * 60 * 1000);

        CONFIG.availableHours.forEach(function (hour) {
            [0, 30].forEach(function (minute) {
                var timeKey = hour + ':' + String(minute).padStart(2, '0');
                var slotTime = new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth(), state.selectedDate.getDate(), hour, minute);

                var slotElement = document.createElement('button');
                slotElement.type = 'button';
                slotElement.className = 'time-slot';
                slotElement.textContent = formatTime(hour, minute);

                var isBooked = bookedTimes.includes(timeKey);
                var isTooSoon = slotTime < minBookingTime;

                if (isBooked || isTooSoon) {
                    slotElement.classList.add('booked');
                } else {
                    slotElement.addEventListener('click', function () { selectTime(timeKey, slotElement); });
                }

                if (state.selectedTime === timeKey) slotElement.classList.add('selected');

                elements.timeSlotsGrid.appendChild(slotElement);
            });
        });
    }

    function updateSummary() {
        elements.summaryDate.innerHTML = state.selectedDate ? formatDate(state.selectedDate) : '<span class="placeholder">Select a date</span>';
        if (state.selectedTime) {
            var parts = state.selectedTime.split(':').map(Number);
            elements.summaryTime.innerHTML = formatTime(parts[0], parts[1]);
        } else {
            elements.summaryTime.innerHTML = '<span class="placeholder">Select a time</span>';
        }
        elements.bookingSubmit.disabled = !(state.selectedDate && state.selectedTime);
    }

    function selectDate(date) {
        var prevSelected = elements.calendarGrid.querySelector('.calendar-day.selected');
        if (prevSelected) prevSelected.classList.remove('selected');

        state.selectedDate = date;
        state.selectedTime = null;

        var days = elements.calendarGrid.querySelectorAll('.calendar-day:not(.calendar-day-header)');
        days.forEach(function (dayEl) {
            var dayNum = parseInt(dayEl.textContent, 10);
            if (dayNum === date.getDate()) dayEl.classList.add('selected');
        });

        renderTimeSlots();
        updateSummary();
    }

    function selectTime(timeKey, element) {
        var prevSelected = elements.timeSlotsGrid.querySelector('.time-slot.selected');
        if (prevSelected) prevSelected.classList.remove('selected');
        state.selectedTime = timeKey;
        element.classList.add('selected');
        updateSummary();
    }

    function navigateMonth(direction) {
        state.currentMonth += direction;
        if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
        else if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }

        var now = new Date();
        if (state.currentYear < now.getFullYear() || (state.currentYear === now.getFullYear() && state.currentMonth < now.getMonth())) {
            state.currentMonth = now.getMonth();
            state.currentYear = now.getFullYear();
        }
        var maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + CONFIG.maxAdvanceDays);
        if (state.currentYear > maxDate.getFullYear() || (state.currentYear === maxDate.getFullYear() && state.currentMonth > maxDate.getMonth())) {
            state.currentMonth = maxDate.getMonth();
            state.currentYear = maxDate.getFullYear();
        }
        fetchAvailability();
    }

    // ====================================
    // Submit — create booking, redirect to Stripe
    // ====================================
    function showError(msg) {
        elements.bookingError.textContent = msg;
        elements.bookingError.style.display = 'block';
    }

    function hideError() {
        elements.bookingError.style.display = 'none';
    }

    async function submitBooking(formData) {
        hideError();
        var origin = window.location.origin;

        var payload = {
            sessionType: sessionType,
            headcount: state.headcount,
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName') || undefined,
            email: formData.get('email'),
            phone: formData.get('phone') || undefined,
            meetingPreference: formData.get('meetingPreference'),
            coachingContext: formData.get('coachingContext') || undefined,
            scheduledDate: getDateKey(state.selectedDate),
            scheduledTime: state.selectedTime,
            successUrl: origin + '/session-confirmed.html',
            cancelUrl: window.location.href
        };

        try {
            var apiUrl = (window.VINTUS_CONFIG && window.VINTUS_CONFIG.API_URL) || '';
            var response = await fetch(apiUrl + '/api/v1/session-bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            var result = await response.json().catch(function () { return {}; });

            if (response.ok && result.success && result.data && result.data.url) {
                window.location.href = result.data.url;
                return;
            }

            showError(result.error || 'Something went wrong. Please try again or email vintusperformance@gmail.com.');
        } catch (error) {
            showError('Connection issue. Please try again or email vintusperformance@gmail.com.');
        }
    }

    // ====================================
    // Init
    // ====================================
    function init() {
        if (!elements.calendarGrid) return;

        renderSessionInfo();

        elements.prevMonth.addEventListener('click', function () { navigateMonth(-1); });
        elements.nextMonth.addEventListener('click', function () { navigateMonth(1); });

        elements.bookingForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            if (!state.selectedDate || !state.selectedTime) return;

            var formData = new FormData(e.target);
            var submitText = elements.bookingSubmit.querySelector('.submit-text');
            var submitLoading = elements.bookingSubmit.querySelector('.submit-loading');
            submitText.style.display = 'none';
            submitLoading.style.display = 'inline-flex';
            elements.bookingSubmit.disabled = true;

            await submitBooking(formData);

            submitText.style.display = 'inline';
            submitLoading.style.display = 'none';
            elements.bookingSubmit.disabled = !(state.selectedDate && state.selectedTime);
        });

        fetchAvailability();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

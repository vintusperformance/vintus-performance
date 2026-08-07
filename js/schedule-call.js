/**
 * Vintus Performance — Weekly Coaching Call Booking
 * Authenticated Private Coaching clients book their included free weekly
 * 30-min call. Shares the /api/v1/leads/slots calendar with every other
 * booking flow so nothing double-books.
 */

(function () {
    'use strict';

    if (!isLoggedIn()) {
        window.location.href = '/login';
        return;
    }

    var CONFIG = {
        availableHours: [9, 10, 11, 13, 14, 15, 16, 17, 18],
        availableDays: [0, 1, 2, 3, 4, 5],
        maxAdvanceDays: 30,
        minNoticeHours: 24
    };

    var state = {
        currentMonth: new Date().getMonth(),
        currentYear: new Date().getFullYear(),
        selectedDate: null,
        selectedTime: null,
        bookedSlots: {},
        isSubmitting: false
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
        bookingSubmit: document.getElementById('bookingSubmit'),
        bookingError: document.getElementById('bookingError'),
        calendarLoading: document.getElementById('calendarLoading'),
        bookingContainer: document.getElementById('bookingContainer'),
        alreadyBookedState: document.getElementById('alreadyBookedState'),
        alreadyBookedTime: document.getElementById('alreadyBookedTime'),
        alreadyBookedMeetLink: document.getElementById('alreadyBookedMeetLink'),
        cancelCallBtn: document.getElementById('cancelCallBtn')
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

    // ====================================
    // Check for an existing upcoming call first
    // ====================================
    async function checkExistingBooking() {
        try {
            var res = await apiGet('/api/v1/dashboard/weekly-call');
            if (res.success && res.data && res.data.booking) {
                showAlreadyBooked(res.data.booking);
                return true;
            }
        } catch (err) {
            // Fall through to the booking calendar if this fails.
        }
        return false;
    }

    function showAlreadyBooked(booking) {
        elements.bookingContainer.style.display = 'none';
        elements.alreadyBookedState.style.display = 'block';

        var d = new Date(booking.scheduledDate + 'T12:00:00');
        var parts = booking.scheduledTime.split(':').map(Number);
        elements.alreadyBookedTime.textContent = formatDate(d) + ' at ' + formatTime(parts[0], parts[1]);

        if (booking.meetLink) {
            elements.alreadyBookedMeetLink.innerHTML =
                '<a href="' + booking.meetLink + '" target="_blank" rel="noopener noreferrer" style="color:var(--silver);">Join Google Meet</a>';
        }

        elements.cancelCallBtn.addEventListener('click', function () {
            elements.cancelCallBtn.disabled = true;
            elements.cancelCallBtn.textContent = 'Canceling...';
            apiDelete('/api/v1/dashboard/weekly-call/' + booking.id)
                .then(function () { window.location.reload(); })
                .catch(function (err) {
                    elements.cancelCallBtn.disabled = false;
                    elements.cancelCallBtn.textContent = 'Cancel This Call';
                    alert(err.message || 'Failed to cancel. Please try again.');
                });
        });
    }

    // ====================================
    // Availability (shared with every other booking flow)
    // ====================================
    async function fetchAvailability() {
        showLoading(true);
        try {
            var response = await fetch(((window.VINTUS_CONFIG && window.VINTUS_CONFIG.API_URL) || '') + '/api/v1/leads/slots?month=' + (state.currentMonth + 1) + '&year=' + state.currentYear);
            if (response.ok) {
                var result = await response.json();
                state.bookedSlots = (result.data && result.data.bookedSlots) || {};
            } else {
                state.bookedSlots = {};
            }
        } catch (error) {
            state.bookedSlots = {};
        }
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

    function showError(msg) {
        elements.bookingError.textContent = msg;
        elements.bookingError.style.display = 'block';
    }

    function hideError() {
        elements.bookingError.style.display = 'none';
    }

    async function submitBooking() {
        if (state.isSubmitting || !state.selectedDate || !state.selectedTime) return;
        hideError();
        state.isSubmitting = true;
        elements.bookingSubmit.disabled = true;
        elements.bookingSubmit.textContent = 'Booking...';

        try {
            var res = await apiPost('/api/v1/dashboard/weekly-call', {
                scheduledDate: getDateKey(state.selectedDate),
                scheduledTime: state.selectedTime
            });
            if (res.success && res.data && res.data.booking) {
                showAlreadyBooked(res.data.booking);
            } else {
                showError('Something went wrong. Please try again.');
            }
        } catch (err) {
            showError(err.message || 'Connection issue. Please try again.');
        }

        state.isSubmitting = false;
        elements.bookingSubmit.disabled = !(state.selectedDate && state.selectedTime);
        elements.bookingSubmit.textContent = 'Confirm My Call';
    }

    async function init() {
        var alreadyHasBooking = await checkExistingBooking();
        if (alreadyHasBooking) return;

        if (!elements.calendarGrid) return;

        elements.prevMonth.addEventListener('click', function () { navigateMonth(-1); });
        elements.nextMonth.addEventListener('click', function () { navigateMonth(1); });
        elements.bookingSubmit.addEventListener('click', submitBooking);

        fetchAvailability();
    }

    init();
})();

const TRADING_MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];

function parseTradingDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function formatTradingDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getMonthBoundary(year, month, boundary) {
    if (boundary === "start") {
        return new Date(year, month, 1);
    }

    return new Date(year, month + 1, 0);
}

function dateIsInRange(date, minimumDate, maximumDate) {
    return date >= minimumDate && date <= maximumDate;
}

function dateIsAWeekday(date) {
    return date.getDay() !== 0 && date.getDay() !== 6;
}

function clampDate(date, minimumDate, maximumDate) {
    if (date < minimumDate) return new Date(minimumDate);
    if (date > maximumDate) return new Date(maximumDate);
    return new Date(date);
}

function runTradingDatePickers() {
    const datePickers = document.querySelectorAll("[data-date-picker]");

    datePickers.forEach((datePicker) => {
        const dateInput = datePicker.querySelector(
            "[data-trading-date-input]"
        );
        const toggleButton = datePicker.querySelector(
            "[data-date-picker-toggle]"
        );
        const popup = datePicker.querySelector(
            "[data-date-picker-popup]"
        );
        const previousButton = datePicker.querySelector(
            "[data-date-picker-previous]"
        );
        const nextButton = datePicker.querySelector(
            "[data-date-picker-next]"
        );
        const monthButton = datePicker.querySelector(
            "[data-date-picker-month]"
        );
        const yearButton = datePicker.querySelector(
            "[data-date-picker-year]"
        );
        const dayView = datePicker.querySelector(
            "[data-date-picker-day-view]"
        );
        const dayGrid = datePicker.querySelector(
            "[data-date-picker-days]"
        );
        const monthGrid = datePicker.querySelector(
            "[data-date-picker-months]"
        );
        const yearGrid = datePicker.querySelector(
            "[data-date-picker-years]"
        );
        const minimumDate = parseTradingDate(
            datePicker.dataset.minDate
        );
        const maximumDate = parseTradingDate(
            datePicker.dataset.maxDate
        );

        if (!minimumDate || !maximumDate) {
            return;
        }

        let displayedDate = new Date(maximumDate);
        let selectedDate = null;
        let currentView = "days";

        function monthIsInRange(year, month) {
            const firstDate = getMonthBoundary(year, month, "start");
            const lastDate = getMonthBoundary(year, month, "end");

            return lastDate >= minimumDate && firstDate <= maximumDate;
        }

        function createOptionButton(text, className) {
            const button = document.createElement("button");

            button.type = "button";
            button.className = className;
            button.textContent = text;
            return button;
        }

        function showDayView() {
            currentView = "days";
            dayView.hidden = false;
            monthGrid.hidden = true;
            yearGrid.hidden = true;
        }

        function renderDays() {
            const year = displayedDate.getFullYear();
            const month = displayedDate.getMonth();
            const firstDay = new Date(year, month, 1).getDay();
            const dayCount = new Date(year, month + 1, 0).getDate();

            dayGrid.replaceChildren();

            for (let index = 0; index < firstDay; index += 1) {
                const blank = document.createElement("span");
                blank.className = "date-picker-day-blank";
                dayGrid.append(blank);
            }

            for (let day = 1; day <= dayCount; day += 1) {
                const date = new Date(year, month, day);
                const button = createOptionButton(
                    String(day),
                    "date-picker-day"
                );
                const isSelected = selectedDate &&
                    formatTradingDate(date) ===
                        formatTradingDate(selectedDate);

                button.disabled =
                    !dateIsInRange(date, minimumDate, maximumDate) ||
                    !dateIsAWeekday(date);
                button.setAttribute(
                    "aria-label",
                    `${TRADING_MONTH_NAMES[month]} ${day}, ${year}`
                );

                if (isSelected) {
                    button.classList.add("date-picker-day--selected");
                    button.setAttribute("aria-current", "date");
                }

                button.addEventListener("click", () => {
                    selectedDate = date;
                    dateInput.value = formatTradingDate(date);
                    dateInput.dispatchEvent(new Event("change", {
                        bubbles: true
                    }));
                    closePicker();
                    dateInput.focus();
                });
                dayGrid.append(button);
            }
        }

        function renderMonths() {
            const displayedYear = displayedDate.getFullYear();

            monthGrid.replaceChildren();

            TRADING_MONTH_NAMES.forEach((monthName, month) => {
                const button = createOptionButton(
                    monthName.slice(0, 3),
                    "date-picker-option"
                );

                button.setAttribute("aria-label", monthName);
                button.disabled = !monthIsInRange(displayedYear, month);

                if (month === displayedDate.getMonth()) {
                    button.classList.add("date-picker-option--selected");
                }

                button.addEventListener("click", () => {
                    displayedDate = clampDate(
                        new Date(displayedYear, month, 1),
                        minimumDate,
                        maximumDate
                    );
                    showDayView();
                    renderPicker();
                });
                monthGrid.append(button);
            });
        }

        function renderYears() {
            const minimumYear = minimumDate.getFullYear();
            const maximumYear = maximumDate.getFullYear();

            yearGrid.replaceChildren();

            for (let year = minimumYear; year <= maximumYear; year += 1) {
                const button = createOptionButton(
                    String(year),
                    "date-picker-option"
                );

                if (year === displayedDate.getFullYear()) {
                    button.classList.add("date-picker-option--selected");
                }

                button.addEventListener("click", () => {
                    displayedDate = clampDate(
                        new Date(year, displayedDate.getMonth(), 1),
                        minimumDate,
                        maximumDate
                    );
                    showDayView();
                    renderPicker();
                });
                yearGrid.append(button);
            }
        }

        function renderPicker() {
            const year = displayedDate.getFullYear();
            const month = displayedDate.getMonth();
            const previousMonth = new Date(year, month - 1, 1);
            const nextMonth = new Date(year, month + 1, 1);

            monthButton.textContent = TRADING_MONTH_NAMES[month];
            yearButton.textContent = String(year);
            previousButton.disabled = !monthIsInRange(
                previousMonth.getFullYear(),
                previousMonth.getMonth()
            );
            nextButton.disabled = !monthIsInRange(
                nextMonth.getFullYear(),
                nextMonth.getMonth()
            );

            renderDays();
            renderMonths();
            renderYears();
        }

        function closePicker() {
            popup.hidden = true;
            toggleButton.setAttribute("aria-expanded", "false");
        }

        function openPicker() {
            document.querySelectorAll("[data-date-picker-popup]")
                .forEach((otherPopup) => {
                    if (otherPopup !== popup) otherPopup.hidden = true;
                });
            document.querySelectorAll("[data-date-picker-toggle]")
                .forEach((otherToggle) => {
                    if (otherToggle !== toggleButton) {
                        otherToggle.setAttribute("aria-expanded", "false");
                    }
                });

            selectedDate = parseTradingDate(dateInput.value);
            displayedDate = clampDate(
                selectedDate || maximumDate,
                minimumDate,
                maximumDate
            );
            showDayView();
            renderPicker();
            popup.hidden = false;
            toggleButton.setAttribute("aria-expanded", "true");

            window.requestAnimationFrame(() => {
                const selectedButton = popup.querySelector(
                    ".date-picker-day--selected"
                );
                const firstAvailableButton = popup.querySelector(
                    ".date-picker-day:not(:disabled)"
                );

                (selectedButton || firstAvailableButton)?.focus();
            });
        }

        toggleButton.addEventListener("click", () => {
            if (popup.hidden) {
                openPicker();
            } else {
                closePicker();
            }
        });

        previousButton.addEventListener("click", () => {
            displayedDate = new Date(
                displayedDate.getFullYear(),
                displayedDate.getMonth() - 1,
                1
            );
            renderPicker();
        });

        nextButton.addEventListener("click", () => {
            displayedDate = new Date(
                displayedDate.getFullYear(),
                displayedDate.getMonth() + 1,
                1
            );
            renderPicker();
        });

        monthButton.addEventListener("click", () => {
            currentView = currentView === "months" ? "days" : "months";
            dayView.hidden = currentView !== "days";
            monthGrid.hidden = currentView !== "months";
            yearGrid.hidden = true;
            renderMonths();
        });

        yearButton.addEventListener("click", () => {
            currentView = currentView === "years" ? "days" : "years";
            dayView.hidden = currentView !== "days";
            monthGrid.hidden = true;
            yearGrid.hidden = currentView !== "years";
            renderYears();
        });

        document.addEventListener("click", (event) => {
            if (!datePicker.contains(event.target)) {
                closePicker();
            }
        });

        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !popup.hidden) {
                closePicker();
                toggleButton.focus();
            }
        });
    });
}

runTradingDatePickers();

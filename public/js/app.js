function runSlideshow() {
    const slides = Array.from(document.querySelectorAll(".slideshow-slide"));
    const leftButton = document.querySelector(".slideshow-button--left");
    const rightButton = document.querySelector(".slideshow-button--right");

    if (slides.length === 0 || !leftButton || !rightButton) {
        return;
    }
    
    let currentIndex = 1;

    function getWrappedIndex(index) {
        return (index + slides.length) % slides.length;
    }

    function renderSlides() {
        const leftIndex = getWrappedIndex(currentIndex - 1);
        const middleIndex = currentIndex;
        const rightIndex = getWrappedIndex(currentIndex + 1);

        slides.forEach((slide, index) => {
            slide.classList.remove(
                "slideshow-slide--hidden",
                "slideshow-slide--left",
                "slideshow-slide--middle",
                "slideshow-slide--right",
                "slideshow-slide--side"
            );

            const image = slide.querySelector(".slideshow-image");
            image?.classList.remove("slideshow-image--side");

            if (index === leftIndex) {
                slide.classList.add("slideshow-slide--left", "slideshow-slide--side");
                image?.classList.add("slideshow-image--side");
            } 

            if (index === middleIndex) {
                slide.classList.add("slideshow-slide--middle");
            }

            if (index === rightIndex) {
                slide.classList.add("slideshow-slide--right", "slideshow-slide--side");
                image?.classList.add("slideshow-image--side");
            }

            if (
                index !== leftIndex &&
                index !== middleIndex &&
                index !== rightIndex
            ) {
                slide.classList.add("slideshow-slide--hidden");
            }
        });
    }

    function showPreviousSlide() {
        currentIndex = getWrappedIndex(currentIndex - 1);
        renderSlides();
    }

    function showNextSlide() {
        currentIndex = getWrappedIndex(currentIndex + 1);
        renderSlides();
    }

    leftButton.addEventListener("click", showPreviousSlide);
    rightButton.addEventListener("click", showNextSlide);
}

function runSignupForm() {
    const signupForm = document.querySelector("[data-signup-form]");

    if (!signupForm) {
        return;
    }

    const usernameInput = signupForm.querySelector("#username");
    const emailInput = signupForm.querySelector("#email");
    const passwordInput = signupForm.querySelector("#password");
    const confirmPasswordInput = signupForm.querySelector("#confirm-password");

    function clearAccountValidation() {
        usernameInput.setCustomValidity("");
        emailInput.setCustomValidity("");
    }

    function clearPasswordValidation() {
        passwordInput.setCustomValidity("");
        confirmPasswordInput.setCustomValidity("");
    }

    function validatePasswords() {
        clearPasswordValidation();

        if (passwordInput.value !== confirmPasswordInput.value) {
            confirmPasswordInput.setCustomValidity("Passwords do not match.");
            confirmPasswordInput.reportValidity();
            return false;
        }

        return true;
    }

    async function validateAvailability() {
        clearAccountValidation();

        if (!usernameInput.value && !emailInput.value) {
            return true;
        }

        const response = await fetch("/api/signup-availability", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username: usernameInput.value,
                email: emailInput.value
            })
        });

        if (!response.ok) {
            throw new Error("Signup availability check failed.");
        }

        const result = await response.json();

        if (!result.usernameAvailable) {
            usernameInput.setCustomValidity("That username is already taken.");
            usernameInput.reportValidity();
            return false;
        }

        if (!result.emailAvailable) {
            emailInput.setCustomValidity("That email is already in use.");
            emailInput.reportValidity();
            return false;
        }

        return true;
    }

    signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        usernameInput.value = usernameInput.value.trim();
        emailInput.value = emailInput.value.trim().toLowerCase();
        clearAccountValidation();

        if (!validatePasswords()) {
            return;
        }

        if (!signupForm.reportValidity()) {
            return;
        }

        try {
            const isAvailable = await validateAvailability();

            if (!isAvailable) {
                return;
            }
        } catch {
            // This is intentionally blank.
        }

        HTMLFormElement.prototype.submit.call(signupForm);
    });

    usernameInput.addEventListener("input", clearAccountValidation);
    emailInput.addEventListener("input", clearAccountValidation);
    passwordInput.addEventListener("input", clearPasswordValidation);
    confirmPasswordInput.addEventListener("input", clearPasswordValidation);
}

function runLoginForm() {
    const loginForm = document.querySelector("[data-login-form]");

    if (!loginForm) {
        return;
    }

    const passwordInput = loginForm.querySelector("#password");

    function clearPasswordField() {
        if (passwordInput) {
            passwordInput.value = "";
        }
    }

    clearPasswordField();

    window.addEventListener("pageshow", (event) => {
        const navigationEntries = window.performance.getEntriesByType("navigation");
        const navigationType = navigationEntries[0]?.type;

        if (event.persisted || navigationType === "back_forward") {
            clearPasswordField();
        }
    });
}

function runResetPasswordForm() {
    const resetPasswordForm = document.querySelector("[data-reset-password-form]");

    if (!resetPasswordForm) {
        return;
    }

    const passwordInput = resetPasswordForm.querySelector("#password");
    const confirmPasswordInput = resetPasswordForm.querySelector("#confirm-password");

    function clearPasswordValidation() {
        passwordInput.setCustomValidity("");
        confirmPasswordInput.setCustomValidity("");
    }

    function validatePasswords() {
        clearPasswordValidation();

        if (passwordInput.value !== confirmPasswordInput.value) {
            confirmPasswordInput.setCustomValidity("Passwords do not match.");
            confirmPasswordInput.reportValidity();
            return false;
        }

        return true;
    }

    resetPasswordForm.addEventListener("submit", (event) => {
        clearPasswordValidation();

        if (!validatePasswords()) {
            event.preventDefault();
        }
    });

    passwordInput.addEventListener("input", clearPasswordValidation);
    confirmPasswordInput.addEventListener("input", clearPasswordValidation);
}

function runDeleteAccountForm() {
    const deleteAccountForm = document.querySelector("[data-delete-account-form]");

    if (!deleteAccountForm) {
        return;
    }

    const confirmationInput = deleteAccountForm.querySelector("#profile-delete-confirmation");

    if (!confirmationInput) {
        return;
    }

    function clearConfirmationValidation() {
        confirmationInput.setCustomValidity("");
    }

    deleteAccountForm.addEventListener("submit", (event) => {
        clearConfirmationValidation();

        if (confirmationInput.value !== "DELETE") {
            confirmationInput.setCustomValidity('You must enter "DELETE" to confirm.');
            confirmationInput.reportValidity();
            event.preventDefault();
        }
    });

    confirmationInput.addEventListener("input", clearConfirmationValidation);
}

function runQueryCleaner() {
    const queryCleaner = document.querySelector("[data-clear-query]");

    if (!queryCleaner || !window.location.search) {
        return;
    }

    const keepParameters = String(queryCleaner.dataset.clearQueryKeep || "")
        .split(",")
        .map((parameter) => parameter.trim())
        .filter(Boolean);
    const currentParameters = new URLSearchParams(window.location.search);
    const cleanParameters = new URLSearchParams();

    keepParameters.forEach((parameter) => {
        const values = currentParameters.getAll(parameter);
        values.forEach((value) => cleanParameters.append(parameter, value));
    });

    const cleanSearch = cleanParameters.toString();
    const cleanURL =
        `${window.location.pathname}${cleanSearch
        ? `?${cleanSearch}`
        : ""}${window.location.hash}`;

    window.history.replaceState({}, document.title, cleanURL);
}

function runProtectedPageGuard() {
    const protectedPage = document.body?.dataset.protectedPage !== undefined;

    if (!protectedPage) {
        return;
    }

    window.addEventListener("pageshow", (event) => {
        const navigationEntries = window.performance.getEntriesByType("navigation");
        const navigationType = navigationEntries[0]?.type;

        if (event.persisted || navigationType === "back_forward") {
            window.location.reload();
        }
    });
}

function runCandlestickChart() {
    const canvas = document.getElementById("candlestick-chart");
    const controls = document.querySelector("[data-input-chart-controls]");
    const dateInput = document.querySelector("[data-input-chart-date]");
    const status = document.querySelector("[data-input-chart-status]");
    const tradeFieldset = document.querySelector(
        "[data-input-trade-fieldset]"
    );
    const tradeActionButtons = document.querySelectorAll(
        "[data-trade-action]"
    );
    const closeTradeButton = document.querySelector(
        '[data-trade-action="close"]'
    );
    const contractCountInput = document.querySelector(
        "[data-contract-count]"
    );
    const tradeNotesInput = document.querySelector(
        "[data-trade-notes]"
    );
    const processDeviationInput = document.querySelector(
        "[data-process-deviation]"
    );
    const tradeForm = document.querySelector(
        "[data-input-trade-form]"
    );
    const undoOrderButton = document.querySelector(
        "[data-undo-order]"
    );
    const resetOrdersButton = document.querySelector(
        "[data-reset-orders]"
    );
    const completedTradesSection = document.querySelector(
        "[data-completed-trades-section]"
    );
    const completedTrades = document.querySelector(
        "[data-completed-trades]"
    );

    if (
        !canvas ||
        !controls ||
        !dateInput ||
        !status ||
        !tradeFieldset ||
        !closeTradeButton ||
        !contractCountInput ||
        !tradeNotesInput ||
        !processDeviationInput ||
        !tradeForm ||
        !undoOrderButton ||
        !resetOrdersButton ||
        !completedTradesSection ||
        !completedTrades
    ) {
        return;
    }

    const chart = new CandlestickChart(canvas);
    const tradeDraft = new TradeDraft();

    let selectedTradeAction = null;

    function clearSelectedTradeAction() {
        selectedTradeAction = null;

        tradeActionButtons.forEach((button) => {
            button.setAttribute("aria-pressed", "false");
        });
    }

    function updateTradeActionAvailability() {
        closeTradeButton.disabled =
            !tradeDraft.hasActiveTrade();

        const canUndo = tradeDraft.canUndo();

        undoOrderButton.disabled = !canUndo;
        resetOrdersButton.disabled = !canUndo;
    }

    function resetTradeDetails() {
        tradeNotesInput.value = "";
        processDeviationInput.checked = false;
    }

    function restoreActiveTradeDetails() {
        const details = tradeDraft.getActiveTradeDetails();

        if (!details) {
            resetTradeDetails();
            return;
        }

        tradeNotesInput.value = details.notes;
        processDeviationInput.checked =
            details.processDeviation;
    }

    function renderCompletedTrades() {
        const trades =
            tradeDraft.getCompletedTradesForDisplay();

        completedTrades.replaceChildren();
        completedTradesSection.hidden = trades.length === 0;

        trades.forEach((trade, index) => {
            const entryEvents =
                trade.side === "long"
                    ? trade.orderEvents.buySide
                    : trade.orderEvents.sellSide;
            const contractCount = entryEvents.reduce(
                (total, orderEvent) =>
                    total + orderEvent.contractCount,
                0
            );
            const details = document.createElement("details");
            const summary = document.createElement("summary");
            const notes = document.createElement("p");
            const processDeviation = document.createElement("p");

            summary.textContent =
                `Trade ${index + 1}: ${trade.side}, ` +
                `${contractCount} ` +
                `contract${contractCount === 1 ? "" : "s"}`;
            notes.textContent =
                `Notes: ${trade.notes || "None"}`;
            processDeviation.textContent =
                "Process deviation: " +
                (trade.processDeviation ? "Yes" : "No");

            details.append(
                summary,
                notes,
                processDeviation
            );
            completedTrades.append(details);
        });
    }

    tradeActionButtons.forEach((button) => {
        button.addEventListener("click", () => {
            selectedTradeAction = button.dataset.tradeAction;

            tradeActionButtons.forEach((actionButton) => {
                actionButton.setAttribute(
                    "aria-pressed",
                    String(actionButton === button)
                );
            });

            status.textContent =
                `${button.textContent.trim()} selected. ` +
                "Click the chart to place the order.";
        });
    });

    canvas.addEventListener("click", () => {
        if (!selectedTradeAction) {
            status.textContent =
                "Select Buy, Sell, or Close first.";
            return;
        }

        const chartSelection =
            chart.getCrosshairSelection();

        if (!chartSelection) {
            status.textContent =
                "Click inside the chart area.";
            return;
        }

        let orderSide = selectedTradeAction;
        let contractCount = contractCountInput.valueAsNumber;

        if (selectedTradeAction === "close") {
            const netContractCount =
                tradeDraft.getNetContractCount();

            if (netContractCount === 0) {
                status.textContent =
                    "There is no open position to close.";
                return;
            }

            orderSide =
                netContractCount > 0
                ? "sell"
                : "buy";
            contractCount =
                Math.abs(netContractCount);
        } else if (
            !contractCountInput.reportValidity() ||
            !Number.isSafeInteger(contractCount) ||
            contractCount <= 0
        ) {
            status.textContent =
                "Enter a valid contract count.";
            return;
        }

        const notes = tradeNotesInput.value;
        const processDeviation =
            processDeviationInput.checked;
        const hadActiveTrade =
            tradeDraft.hasActiveTrade();
        const completedTradeCountBefore =
            tradeDraft.getCompletedTradeCount();

        try {
            if (hadActiveTrade) {
                tradeDraft.updateActiveTradeDetails(
                    notes,
                    processDeviation
                );
            }

            tradeDraft.recordOrderEvent(
                orderSide,
                {
                    time: chartSelection.time,
                    price: chartSelection.price,
                    contractCount
                }
            );

            chart.setOrderMarkers(
                tradeDraft.getOrderEventsForDisplay()
            );
            renderCompletedTrades();

            if (
                !hadActiveTrade &&
                tradeDraft.hasActiveTrade()
            ) {
                tradeDraft.updateActiveTradeDetails(
                    notes,
                    processDeviation
                );
            }

            const completedTrade =
                tradeDraft.getCompletedTradeCount() >
                completedTradeCountBefore;

            if (completedTrade) resetTradeDetails();

            const netContractCount =
                tradeDraft.getNetContractCount();

            clearSelectedTradeAction();
            updateTradeActionAvailability();

            if (netContractCount > 0) {
                status.textContent =
                    `Open position: long ${netContractCount}.`;
            } else if (netContractCount < 0) {
                status.textContent =
                    `Open position: short ${Math.abs(netContractCount)}.`;
            } else {
                status.textContent =
                    "Trade completed.";
            }
        } catch (error) {
            status.textContent = error.message;
        }
    });

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(canvas);
    chart.resize();

    async function loadChart(tradingDate = "") {
        tradeDraft.clear();
        renderCompletedTrades();
        resetTradeDetails();
        clearSelectedTradeAction();
        updateTradeActionAvailability();
        tradeFieldset.disabled = true;

        const searchParameters =
            new URLSearchParams();

        if (tradingDate) {
            searchParameters.set("date", tradingDate);
        }

        const query = searchParameters.toString();
        const requestURL = `/api/input-chart${query ? `?${query}` : ""}`;

        status.textContent = "Loading chart...";

        try {
            const response = await fetch(requestURL);
            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(
                    responseData.error ||
                    "The chart request failed."
                );
            }

            if (responseData.tradingDate) {
                dateInput.value = responseData.tradingDate;
            }

            chart.setCandlesticks(
                responseData.candlesticks
            );

            tradeFieldset.disabled = !responseData.canSubmit;

            status.textContent =
                `Loaded ${responseData.candlesticks.length} ` +
                `five-minute candlesticks.`;
        } catch (error) {
            chart.setCandlesticks([]);
            status.textContent = error.message;
        }
    }

    controls.addEventListener("submit", (event) => {
        event.preventDefault();

        dateInput.value = dateInput.value.trim();

        if (!controls.reportValidity()) return;

        loadChart(dateInput.value);
    });

    undoOrderButton.addEventListener("click", () => {
        if (!tradeDraft.undoLastOrderEvent()) return;

        chart.setOrderMarkers(
            tradeDraft.getOrderEventsForDisplay()
        );
        renderCompletedTrades();

        restoreActiveTradeDetails();
        clearSelectedTradeAction();
        updateTradeActionAvailability();

        const netContractCount =
            tradeDraft.getNetContractCount();

        if (netContractCount > 0) {
            status.textContent =
                `The undo is complete. Open position: ` +
                `long ${netContractCount} contracts.`;
        } else if (netContractCount < 0) {
            status.textContent =
                `The undo is complete. Open position: ` +
                `short ${Math.abs(netContractCount)} contract.`;
        } else {
            status.textContent =
                "The undo is complete. No position is open.";
        }
    });

    resetOrdersButton.addEventListener("click", () => {
        const shouldReset = window.confirm(
            "Do you want to discard all unsaved trades for this chart?"
        );

        if (!shouldReset) return;

        tradeDraft.clear();
        chart.setOrderMarkers([]);
        renderCompletedTrades();
        resetTradeDetails();
        clearSelectedTradeAction();
        updateTradeActionAvailability();

        status.textContent =
            "All unsaved trades were discarded.";
    });

    tradeForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        let trades;

        try {
            trades =
                tradeDraft.getTradesForSubmission();
        } catch (error) {
            status.textContent = error.message;
            return;
        }

        tradeFieldset.disabled = true;
        status.textContent = "The chart is saving.";

        try {
            const response = await fetch(
                "/api/input-chart",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        tradingDate: dateInput.value,
                        trades
                    })
                }
            );

            const responseIsJSON =
                response.headers
                    .get("content-type")
                    ?.includes("application/json");

            const responseData =
                responseIsJSON
                ? await response.json()
                : {};

            if (!response.ok) {
                throw new Error(
                    responseData.error ||
                    "The chart could not be saved."
                );
            }

            tradeDraft.clear();
            resetTradeDetails();
            clearSelectedTradeAction();
            updateTradeActionAvailability();

            status.textContent =
                `${responseData.savedTradeCount} ` +
                `trade${responseData.savedTradeCount === 1 ? "" : "s"} ` +
                `${responseData.savedTradeCount === 1 ? "was" : "were"} saved.`;
        } catch (error) {
            tradeFieldset.disabled = false;
            updateTradeActionAvailability();
            status.textContent = error.message;
        }
    });

    loadChart();
}

function runColorSchemeForm() {
    const colorSchemeForm = document.querySelector(
        "[data-color-scheme-form]"
    );

    if (!colorSchemeForm) return;

    const colorSchemeInputs = colorSchemeForm.querySelectorAll(
        "input[name='changeColorScheme']"
    );

    colorSchemeInputs.forEach((input) => {
        input.addEventListener("change", () => {
            HTMLFormElement.prototype.submit.call(colorSchemeForm);
        });
    });
}

runSlideshow();
runSignupForm();
runLoginForm();
runColorSchemeForm();
runResetPasswordForm();
runDeleteAccountForm();
runQueryCleaner();
runProtectedPageGuard();
runCandlestickChart();

/** Runs behavior shared by navigation, forms, popups, and logged-in pages. */
/*
 * This function asks the browser how the current page was opened.
 *
 * Returns text such as "navigate," "reload," or "back_forward."
 * Returns undefined when the browser does not provide the information.
 */
function getNavigationType() {
    const navigationEntries =
        window.performance.getEntriesByType("navigation");

    return navigationEntries[0]?.type;
}

/*
 * This function removes earlier custom errors from two password inputs.
 *
 * It changes both input elements and does not return a value.
 */
function clearPasswordValidation(passwordInput, confirmationInput) {
    passwordInput.setCustomValidity("");
    confirmationInput.setCustomValidity("");
}

/*
 * This function checks whether a password and confirmation password match.
 *
 * Returns true when they match. When they differ, it asks the browser to show
 * an error on the confirmation field and returns false.
 */
function validatePasswordConfirmation(passwordInput, confirmationInput) {
    clearPasswordValidation(passwordInput, confirmationInput);

    if (passwordInput.value === confirmationInput.value) {
        return true;
    }

    confirmationInput.setCustomValidity("Passwords do not match.");
    confirmationInput.reportValidity();
    return false;
}

/*
 * This function reads an API response in the format used by browser scripts.
 *
 * JSON is the text format used to send data between this browser code and the
 * API. A successful JSON response is converted into a JavaScript object. A
 * failed response throws an Error using the server's message when available,
 * or the supplied backup message otherwise.
 */
async function readAPIResponse(response, fallbackErrorMessage) {
    const responseIsJSON = response.headers
        .get("content-type")
        ?.includes("application/json");
    const responseData = responseIsJSON
        ? await response.json()
        : {};

    if (!response.ok) {
        throw new Error(
            responseData.error || fallbackErrorMessage
        );
    }

    return responseData;
}

/*
 * This function starts the landing-page image slideshow.
 *
 * Moving past the final slide returns to the first slide, and moving backward
 * from the first returns to the final slide. If the page has no slideshow, the
 * function stops without changing anything.
 *
 * It registers event listeners and returns no value.
 */
function runSlideshow() {
    const slides = Array.from(
        document.querySelectorAll(".slideshow-slide")
    );
    const leftButton = document.querySelector(
        ".slideshow-button--left"
    );
    const rightButton = document.querySelector(
        ".slideshow-button--right"
    );

    if (slides.length === 0 || !leftButton || !rightButton) {
        return;
    }

    let currentIndex = 0;

    /*
     * This function changes any slide number into a valid position in the list.
     *
     * Returns a valid array position from zero through the final slide.
     */
    function getWrappedIndex(index) {
        return (index + slides.length) % slides.length;
    }

    /*
     * This function shows the current slide and places nearby slides on its left
     * and right with the correct styling.
     *
     * It changes the slides' CSS classes and does not return a value.
     */
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
                slide.classList.add(
                    "slideshow-slide--left",
                    "slideshow-slide--side"
                );
                image?.classList.add("slideshow-image--side");
            }

            if (index === middleIndex) {
                slide.classList.add("slideshow-slide--middle");
            }

            if (index === rightIndex) {
                slide.classList.add(
                    "slideshow-slide--right",
                    "slideshow-slide--side"
                );
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

    /* This function moves to the previous slide and redraws the slideshow. */
    function showPreviousSlide() {
        currentIndex = getWrappedIndex(currentIndex - 1);
        renderSlides();
    }

    /* This function moves to the next slide and redraws the slideshow. */
    function showNextSlide() {
        currentIndex = getWrappedIndex(currentIndex + 1);
        renderSlides();
    }

    leftButton.addEventListener("click", showPreviousSlide);
    rightButton.addEventListener("click", showNextSlide);
    renderSlides();
}

/*
 * This function starts Signup-page validation.
 *
 * It checks that passwords match and asks the API whether the username and email
 * are free. The normal form submission waits until the latest availability
 * request succeeds, preventing submission with an outdated result.
 *
 * It registers Signup form listeners and returns no value.
 */
function runSignupForm() {
    const signupForm = document.querySelector("[data-signup-form]");

    if (!signupForm) {
        return;
    }

    const usernameInput = signupForm.querySelector("#username");
    const emailInput = signupForm.querySelector("#email");
    const passwordInput = signupForm.querySelector("#password");
    const confirmPasswordInput = signupForm.querySelector(
        "#confirm-password"
    );

    /* This function removes old username and email errors after either value changes. */
    function clearAccountValidation() {
        usernameInput.setCustomValidity("");
        emailInput.setCustomValidity("");
    }

    /* This function runs the shared password-matching check and returns its result. */
    function validatePasswords() {
        return validatePasswordConfirmation(
            passwordInput,
            confirmPasswordInput
        );
    }

    /* This function clears passwords when the browser restores an old Signup page. */
    function clearPasswords() {
        clearPasswordValidation(
            passwordInput,
            confirmPasswordInput
        );
    }

    /*
     * This function asks the API whether another account already uses the current
     * username or email.
     *
     * Returns a Promise whose value is true only when both values are available.
     */
    async function validateAvailability(username, email) {
        const response = await fetch("/api/signup-availability", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, email })
        });

        const result = await readAPIResponse(
            response,
            "Signup availability check failed."
        );

        if (usernameInput.value !== username || emailInput.value !== email) {
            throw new Error("Your account details changed. Please submit again.");
        }

        if (
            typeof result?.usernameAvailable !== "boolean" ||
            typeof result?.emailAvailable !== "boolean"
        ) {
            throw new Error("The availability response was invalid. Please try again.");
        }

        if (!result.usernameAvailable) {
            usernameInput.setCustomValidity(
                "That username is already taken."
            );
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

    let availabilityCheckPending = false;

    signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (availabilityCheckPending) return;

        usernameInput.value = usernameInput.value.trim();
        emailInput.value = emailInput.value.trim().toLowerCase();
        clearAccountValidation();

        if (!validatePasswords() || !signupForm.reportValidity()) return;

        availabilityCheckPending = true;

        try {
            const isAvailable = await validateAvailability(
                usernameInput.value,
                emailInput.value
            );

            if (!isAvailable) return;

            // Fields may change while waiting. Recheck them before bypassing normal submission.
            if (!validatePasswords() || !signupForm.reportValidity()) return;

            HTMLFormElement.prototype.submit.call(signupForm);
        } catch (error) {
            // A failed check must block submission, but allow another attempt without an edit.
            usernameInput.setCustomValidity(
                error.message || "Availability could not be checked. Please try again."
            );
            usernameInput.reportValidity();
            usernameInput.setCustomValidity("");
        } finally {
            availabilityCheckPending = false;
        }
    });

    usernameInput.addEventListener("input", clearAccountValidation);
    emailInput.addEventListener("input", clearAccountValidation);
    passwordInput.addEventListener("input", clearPasswords);
    confirmPasswordInput.addEventListener("input", clearPasswords);
}

/*
 * This function prevents the Login password from reappearing when the browser
 * restores the page after Back or Forward navigation.
 *
 * It registers Login listeners and returns no value.
 */
function runLoginForm() {
    const loginForm = document.querySelector("[data-login-form]");

    if (!loginForm) {
        return;
    }

    const passwordInput = loginForm.querySelector("#password");

    /* This function clears the Login password while preserving the username field. */
    function clearPasswordField() {
        if (passwordInput) {
            passwordInput.value = "";
        }
    }

    clearPasswordField();

    window.addEventListener("pageshow", (event) => {
        if (
            event.persisted ||
            getNavigationType() === "back_forward"
        ) {
            clearPasswordField();
        }
    });
}

/*
 * This function starts matching-password checks on the Reset Password page and
 * clears old password values when the browser restores the page.
 *
 * It registers Reset Password listeners and returns no value.
 */
function runResetPasswordForm() {
    const resetPasswordForm = document.querySelector("[data-reset-password-form]");

    if (!resetPasswordForm) {
        return;
    }

    const passwordInput = resetPasswordForm.querySelector("#password");
    const confirmPasswordInput = resetPasswordForm.querySelector(
        "#confirm-password"
    );

    /* This function delegates Reset password-pair validation and returns its boolean result. */
    function validatePasswords() {
        return validatePasswordConfirmation(
            passwordInput,
            confirmPasswordInput
        );
    }

    /* This function clears both reset password fields after restored-page navigation. */
    function clearPasswords() {
        clearPasswordValidation(
            passwordInput,
            confirmPasswordInput
        );
    }

    resetPasswordForm.addEventListener("submit", (event) => {
        if (!validatePasswords()) {
            event.preventDefault();
        }
    });

    passwordInput.addEventListener("input", clearPasswords);
    confirmPasswordInput.addEventListener("input", clearPasswords);
}

/*
 * This function requires the exact word DELETE and a second browser confirmation
 * before the account-deletion form can be submitted.
 *
 * It registers Profile deletion listeners and returns no value.
 */
function runDeleteAccountForm() {
    const deleteAccountForm = document.querySelector(
        "[data-delete-account-form]"
    );

    if (!deleteAccountForm) {
        return;
    }

    const confirmationInput = deleteAccountForm.querySelector(
        "#profile-delete-confirmation"
    );

    if (!confirmationInput) {
        return;
    }

    /* This function clears the custom DELETE validation message after input changes. */
    function clearConfirmationValidation() {
        confirmationInput.setCustomValidity("");
    }

    deleteAccountForm.addEventListener("submit", (event) => {
        clearConfirmationValidation();

        if (confirmationInput.value !== "DELETE") {
            confirmationInput.setCustomValidity(
                'You must enter "DELETE" to confirm.'
            );
            confirmationInput.reportValidity();
            event.preventDefault();
            return;
        }

        const shouldDelete = window.confirm(
            "Delete account permanently?"
        );

        if (!shouldDelete) {
            event.preventDefault();
        }
    });

    confirmationInput.addEventListener("input", clearConfirmationValidation);
}

/*
 * This function removes temporary form information from the address bar after
 * the page loads. Specifically listed parameters may remain when page behavior
 * still needs them.
 *
 * It replaces the current history entry instead of creating a new Back-button
 * entry. It does not return a value.
 */
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

/*
 * This function reloads a private page when the browser restores an old copy
 * after Back or Forward navigation.
 *
 * Without the reload, a person who logged out might still see the old private
 * page even though new server requests would reject them.
 *
 * It registers a pageshow listener and returns no value.
 */
function runProtectedPageGuard() {
    const protectedPage = document.body?.dataset.protectedPage !== undefined;

    if (!protectedPage) {
        return;
    }

    window.addEventListener("pageshow", (event) => {
        if (
            event.persisted ||
            getNavigationType() === "back_forward"
        ) {
            window.location.reload();
        }
    });
}

/*
 * This function controls how the navigation bar behaves while the page scrolls.
 *
 * At the top, the bar stays in its normal page position. After it scrolls out of
 * view, it becomes fixed to the screen. Scrolling down hides the fixed bar.
 * Scrolling up shows it for at most three seconds.
 *
 * It registers resize, scroll, and focus listeners and returns no value.
 */
function runNavbarScroll() {
    const navbar = document.querySelector(".navbar");

    if (!navbar) {
        return;
    }

    /*
     * This function gives CSS the navbar's current height. The empty header can
     * then keep the page from jumping when the navbar becomes fixed.
     */
    function updateNavbarHeight() {
        document.documentElement.style.setProperty(
            "--navbar-height",
            `${navbar.offsetHeight}px`
        );
    }

    const navbarResizeObserver = new ResizeObserver(updateNavbarHeight);

    navbarResizeObserver.observe(navbar);
    updateNavbarHeight();

    let previousScrollPosition = Math.max(window.scrollY, 0);
    let navbarHideTimer = null;

    /* This function cancels the countdown that would hide the fixed navbar. */
    function clearNavbarHideTimer() {
        window.clearTimeout(navbarHideTimer);
        navbarHideTimer = null;
    }

    /* This function hides the navbar only when it is fixed to the screen. */
    function hideNavbar() {
        clearNavbarHideTimer();

        if (!navbar.classList.contains("navbar--fixed")) return;

        navbar.classList.add("navbar--hidden");
    }

    /* This function starts a new three-second countdown while the navbar is fixed. */
    function scheduleNavbarHide() {
        clearNavbarHideTimer();

        if (navbar.classList.contains("navbar--fixed")) {
            navbarHideTimer = window.setTimeout(hideNavbar, 3000);
        }
    }

    /* This function shows the fixed navbar and restarts its hide countdown. */
    function showNavbar() {
        navbar.classList.remove("navbar--hidden");
        scheduleNavbarHide();
    }

    /*
     * This function compares the previous and current scroll positions to learn
     * whether the page moved up or down. The navbar remains visible in its normal
     * position while the original header area is still on screen.
     */
    function updateNavbar() {
        const currentScrollPosition = Math.max(window.scrollY, 0);
        const navbarIsPastViewport =
            currentScrollPosition > navbar.offsetHeight;

        navbar.classList.toggle(
            "navbar--fixed",
            navbarIsPastViewport
        );

        if (!navbarIsPastViewport) {
            clearNavbarHideTimer();
            navbar.classList.remove("navbar--hidden");
            previousScrollPosition = currentScrollPosition;
            return;
        }

        if (currentScrollPosition < previousScrollPosition) {
            showNavbar();
        } else if (currentScrollPosition > previousScrollPosition) {
            hideNavbar();
        } else if (!navbar.classList.contains("navbar--hidden")) {
            scheduleNavbarHide();
        }

        previousScrollPosition = currentScrollPosition;
    }

    window.addEventListener("scroll", updateNavbar, { passive: true });

    navbar.addEventListener("focusin", () => {
        showNavbar();
    });

    updateNavbar();
}

/*
 * This function previews Profile theme-radio changes before the form is submitted.
 *
 * It registers input listeners and returns no value.
 */
function runColorSchemeForm() {
    const colorSchemeForm = document.querySelector(
        "[data-color-scheme-form]"
    );

    if (!colorSchemeForm) {
        return;
    }

    const colorSchemeInputs = colorSchemeForm.querySelectorAll(
        "input[name='changeColorScheme']"
    );

    colorSchemeInputs.forEach((input) => {
        input.addEventListener("change", () => {
            HTMLFormElement.prototype.submit.call(colorSchemeForm);
        });
    });
}

/*
 * This function inserts YYYY-MM-DD separators as users type numeric trading dates.
 * Letters and symbols are discarded, and no more than eight date digits are kept.
 *
 * It registers formatting listeners and returns no value.
 */
function runTradingDateInputs() {
    const dateInputs = document.querySelectorAll(
        "[data-trading-date-input]"
    );

    dateInputs.forEach((dateInput) => {
        dateInput.addEventListener("input", () => {
            const digits = dateInput.value
                .replace(/\D/g, "")
                .slice(0, 8);
            const dateParts = [
                digits.slice(0, 4),
                digits.slice(4, 6),
                digits.slice(6, 8)
            ].filter(Boolean);

            dateInput.value = dateParts.join("-");
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
runNavbarScroll();
runTradingDateInputs();

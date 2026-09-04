function getNavigationType() {
    const navigationEntries =
        window.performance.getEntriesByType("navigation");

    return navigationEntries[0]?.type;
}

function clearPasswordValidation(passwordInput, confirmationInput) {
    passwordInput.setCustomValidity("");
    confirmationInput.setCustomValidity("");
}

function validatePasswordConfirmation(passwordInput, confirmationInput) {
    clearPasswordValidation(passwordInput, confirmationInput);

    if (passwordInput.value === confirmationInput.value) {
        return true;
    }

    confirmationInput.setCustomValidity("Passwords do not match.");
    confirmationInput.reportValidity();
    return false;
}

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
    const confirmPasswordInput = signupForm.querySelector(
        "#confirm-password"
    );

    function clearAccountValidation() {
        usernameInput.setCustomValidity("");
        emailInput.setCustomValidity("");
    }

    function validatePasswords() {
        return validatePasswordConfirmation(
            passwordInput,
            confirmPasswordInput
        );
    }

    function clearPasswords() {
        clearPasswordValidation(
            passwordInput,
            confirmPasswordInput
        );
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

        const result = await readAPIResponse(
            response,
            "Signup availability check failed."
        );

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
    passwordInput.addEventListener("input", clearPasswords);
    confirmPasswordInput.addEventListener("input", clearPasswords);
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
        if (
            event.persisted ||
            getNavigationType() === "back_forward"
        ) {
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
    const confirmPasswordInput = resetPasswordForm.querySelector(
        "#confirm-password"
    );

    function validatePasswords() {
        return validatePasswordConfirmation(
            passwordInput,
            confirmPasswordInput
        );
    }

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
        if (
            event.persisted ||
            getNavigationType() === "back_forward"
        ) {
            window.location.reload();
        }
    });
}

function runNavbarScroll() {
    const navbar = document.querySelector(".navbar");

    if (!navbar) {
        return;
    }

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

    function hideNavbar() {
        window.clearTimeout(navbarHideTimer);
        navbar.classList.add("navbar--hidden");
    }

    function showNavbar() {
        window.clearTimeout(navbarHideTimer);
        navbar.classList.remove("navbar--hidden");

        if (window.scrollY > navbar.offsetHeight) {
            navbarHideTimer = window.setTimeout(hideNavbar, 3000);
        }
    }

    function updateNavbar() {
        const currentScrollPosition = Math.max(window.scrollY, 0);
        const navbarIsPastViewport =
            currentScrollPosition > navbar.offsetHeight;

        navbar.classList.toggle(
            "navbar--fixed",
            navbarIsPastViewport
        );

        if (!navbarIsPastViewport) {
            showNavbar();
        } else if (currentScrollPosition < previousScrollPosition) {
            showNavbar();
        } else if (currentScrollPosition > previousScrollPosition) {
            hideNavbar();
        }

        previousScrollPosition = currentScrollPosition;
    }

    window.addEventListener("scroll", updateNavbar, { passive: true });

    window.addEventListener("wheel", (event) => {
        if (event.deltaY < 0) {
            showNavbar();
        }
    }, { passive: true });

    navbar.addEventListener("focusin", () => {
        showNavbar();
    });
}

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

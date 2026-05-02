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

        const searchParams = new URLSearchParams({
            username: usernameInput.value,
            email: emailInput.value
        });
        const response = await fetch(`/api/signup-availability?${searchParams.toString()}`);

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
            return;
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
    const cleanURL = `${window.location.pathname}${cleanSearch ? `?${cleanSearch}` : ""}${window.location.hash}`;

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

runSlideshow();
runSignupForm();
runLoginForm();
runResetPasswordForm();
runQueryCleaner();
runProtectedPageGuard();

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

runSlideshow();

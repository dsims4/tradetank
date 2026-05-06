class CandlestickChart {
    constructor(canvas, candles = []) {
        this.candles = candles;
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    resize() {
        const boundingClientRect = this.canvas.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;

        this.width = boundingClientRect.width;
        this.height = boundingClientRect.height;

        this.canvas.width = this.width * devicePixelRatio;
        this.canvas.height = this.height * devicePixelRatio;

        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        
        this.render();
    }

    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        
    }
}
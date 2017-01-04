/**
 * Created by Max Kostin on 24/02/2016
 *
 * Tweak is lightweight tweening engine.
 *
 * Features:
 *
 * - Tweens all CSS properties (color, transform, opacity width/height/margin....., etc) and virtual ({a:10})
 * - Uses RAF
 * - Compensates for lagging
 * - Supports chaining (same element, new element or a Function)
 * - Can be referenced as Tweak or T
 *
 * Usage:
 *
 * Tweak._(d1, 2, [
 {prop:"minWidth", to:"200%"},
 {prop:"backgroundColor", to:"#ffcc00"}
 ])
 ._(1, [{prop:"scaleY", to:.5}])
 ._(.5, [{prop:"scaleX", to:.5}])
 ._(.5, [{prop:"rotate", to:-360}], {delay:1, repeat:2})
 ._(d2, .5, [{prop:"rotate", to:-36}])
 ._(function(){console.log("--- END CALL ******************")});
 *
 * Notes:
 *
 * 1. For tweening properties other than Transform and Color, it is advisable to specify 'from:' value, if units are not in pixels.
 * 2. Color values can be passed as HEX #ffcc00, rgb(255, 20, 111) or rgba(200, 0, 100, .2). The output is always RGBa.
 * 3. Other values can be passed as Number or unit (px, em, %, vw, etc). Rotations are automatically converted to "deg",
 * Scales and opacity - to Number. For unspecified units, apart from Scale, Opacity and Color, units used are in "px".
 * 4. For scrolling use "scrollTop" or "scrollLeft" with to parameter set to Number, or Element you want to scroll to.
 *
 *
 * Methods:
 *
 * Tweak._(element, timeInSecs, Array:[{prop:String, to:String|Number, from:String|Number}, {...}], {delay:Number, overwrite:Number, repeat:Number,
 * onComplete:Function, onCompleteParams:Array})
 * Required params are element, time and array with an object with "prop" and "to" properties defined: Tweak._(el, 1, [{prop:"width", to:150}]);
 * Returns tween Tw
 *
 * Tweak.killAll(); - stops and removes all tweens and their timers (if any).
 *
 * Tweak.kill(tween); - stops and removes a tween.
 *
 * Tweak.killTweaksOf(element); - stops and removes all tweens running on an element.
 *
 *
 * Options Object:
 *
 * - call:      Function    Will call a function when Tweak is complete.
 * - onUpdate:  Function    Called every time Tweak progresses.
 * - callArgs:  Array       Arguments to pass to a callee.
 * - delay:     float       Delay in seconds.
 * - repeat:    uint        Number of repeats. Setting it to 1 will play the tweak twice.
 * - overwite   int         -1: Will remove, if exists, previous tweak immediately
 *                          0: Will remove previous when the current one starts. Default.
 *                          1: Does nothing to the previous.
 *
 */

;(function (scope) {

    "use strict";

    if (scope.Tweak || scope.T) {
        return;
    }

    var Tweak = {};

    var tweens = [];
    var isRunning = false;

    var regTrans = /translate|rotate|scale|skew/i;
    var regColor = /color|backgroundColor|background-color|fill/i;

    var useHA = true;
    var manualUpd = false;

    Tweak._ = function (object, time, tweakArray, optionsObj) {

        var tw = new Tw(object, time, tweakArray, optionsObj);

        var ind = objectExists(object);
        if (ind > -1) {
            var tw0 = tweens[ind];
            // -1: kill prev immediately
            if (tw.overwrite === -1) {
                remove(tw0);
                // 0: kill prev when this one starts.
            } else if (tw.overwrite === 0) {
                tw.prevTweak = tw0;
            }
        }

        tweens.push(tw);

        if (!isRunning) {
            requestAnimationFrame(update);
            isRunning = true;
        }
        return tw;
    };

    Tweak.killAll = function () {
        for (var i = 0; i < tweens.length; i++) {
            tweens[i].stop();
        }
        tweens = [];
    };

    Tweak.kill = function (tween) {
        remove(tween);
    };

    Tweak.killTweaksOf = function (obj) {
        for (var i = tweens.length - 1; i >= 0; i--) {
            if (tweens[i].obj === obj) {
                remove(tweens[i]);
            }
        }
    };

    Tweak.setManualUpdate = function (bool) {
        manualUpd = bool;
        if (bool && isRunning) {
            isRunning = false;
        }
    };

    Tweak.update = function() {
        update();
    };




    /* ===================================================================================================
     TW FUNCTIONS
     ====================================================================================================*/

    function Tw(object, time, tweakArray, optionsObj) {

        this._thenArgs = [];
        this.prevTweak = null;
        this.activate = this.activate.bind(this);
        this.setup(object, time, tweakArray, optionsObj);


    }

    Tw.prototype.setup = function (object, time, tweakArray, opts) {
        opts = opts || {};

        this.tweakArray = tweakArray;
        this.t = 0;
        this.obj = object;
        this.duration = time * 60;
        this.easeFunc = opts.ease || Tweak.easeInOut;
        this.delay = opts.delay * 1000 || 0;
        this.repeat = opts.repeat !== undefined ? opts.repeat : 0;
        this.onUpdate = opts.onUpdate;
        this.yoyo = opts.yoyo;
        this.overwrite = (opts.overwrite !== undefined) ? opts.overwrite : 0;
        this.call = opts.call || null;
        this.callArgs = opts.callArgs || null;
        this.tweaks = []; // [0.property, 1.from, 2.to, 3.unit, 4.transformOrder, 5.isColor]
        this.isWaiting = this.delay > 0;
        this.style = object.style;
        this.compStyle = null;
        this.delayInterval = -1;

        this.hasColor = false;
        this.hasTranforms = false;
        this.transformsList = [];

        this.twCommon = [];
        this.twTransform = [];
        this.tweaksColor = [];

        this.calcCommon = [];
        this.calcTransforms = [];
        this.calcColors = [];

        this.resume = this.resume.bind(this);

        if (this.delay > 0) {
            this.delayInterval = setTimeout(this.activate, this.delay);
        } else {
            this.init();
        }


    };


    Tw.prototype.init = function () {

        if (this.prevTweak) {
            remove(this.prevTweak);
            this.prevTweak = null;
        }

        var trans = this.obj.style ? this.obj.style.transform || this.obj.style.webkitTransform : "";
        if (trans) {
            this.transformsList = trans.split(" ");
        }

        for (var i = 0; i < this.tweakArray.length; i++) {


            var prop = this.tweakArray[i].prop;
            var from = this.tweakArray[i].from;

            // If there's no "from" param and an Object has style property (i.e. it's a DOM element), then get computed style.
            if (from === undefined && !this.compStyle && this.style && !prop.match(regTrans)) {
                this.compStyle = getComputedStyle(this.obj);
            }

            if (prop.match(regColor)) {
                this.hasColor = true;
                var colT = getColorTweak(this.tweakArray[i], this.compStyle);
                this.tweaksColor.push(colT);
                this.calcColors.push([colT[2], ""]);
            } else {
                var t = getTweak(this.obj, this.tweakArray[i], this.style, this.transformsList, this.compStyle);
                if (t[0].match(regTrans)) {
                    this.hasTranforms = true;
                    if (t[4] === -1) {
                        t[4] = this.transformsList.length;
                        this.transformsList.push(t[0]);
                    }
                    this.twTransform.push(t);
                    this.calcTransforms.push([t[0], t[1], t[3]]);
                } else {
                    this.twCommon.push(t);
                    this.calcCommon.push([t[0], t[1], t[3]]);
                }

            }
        }


    };

    Tw.prototype.activate = function () {
        this.init();
        this.isWaiting = false;
    };

    Tw.prototype.stop = function () {
        clearTimeout(this.delayInterval);
    };


    Tw.prototype.update = function () {
        "use strict";

        if (this.isWaiting) {
            return;
        }

        this.t += 1;
        if (this.t > this.duration) {
            this.t = this.duration;
        }

        var i,  val;
        var func = this.easeFunc;

        var twCom;
        for (i = 0; i < this.twCommon.length; i++) {
            twCom = this.twCommon[i];
            val = this.easeFunc(this.t, twCom[1],twCom[2], this.duration);
            this.calcCommon[i][1] = val;
        }

        var twTrans;
        for (i = 0; i < this.twTransform.length; i++) {
            twTrans = this.twTransform[i];
            val = this.easeFunc(this.t, twTrans[1],twTrans[2], this.duration);
            this.calcTransforms[i][1] = val;
            this.transformsList[twTrans[4]] = twTrans[0] + "(" + val + twTrans[3] + ") ";
        }

        if (this.hasColor) {
            var j;
            var cLen = this.tweaksColor.length;
            for (j = 0; j < cLen; j++) {
                var c = this.tweaksColor[j];
                var r = parseInt(func(this.t, c[0][0], c[1][0], this.duration));
                var g = parseInt(func(this.t, c[0][1], c[1][1], this.duration));
                var b = parseInt(func(this.t, c[0][2], c[1][2], this.duration));
                var a = func(this.t, c[0][3], c[1][3], this.duration);
                this.calcColors[j][1] = "rgba(" + r + "," + g + "," + b + "," + a + ")";
            }

        }

        if (this.onUpdate) {
            this.onUpdate();
        }



    };

    Tw.prototype.resume = function () {
        this.isWaiting = false;
    };



    Tw.prototype.render = function () {

        if (this.isWaiting) {
            return;
        }

        this.renderCommon();
        this.renderTransforms();
        this.renderColors();

        if (this.t >= this.duration) {
            if (this.repeat === 0) {
                if (this.call) {
                    this.call(this.callArgs);
                }
                if (this._thenArgs.length === 0) {
                    remove(this);
                } else {
                    this.isWaiting = true;
                    this._then();
                }
            } else if (this.repeat === -1) {
                this.t = 0;
                if (this.delay > 0) {
                    this.isWaiting = true;
                    this.delayInterval = setTimeout(this.resume, this.delay);
                }
            } else {
                this.repeat--;
                this.t = 0;
                if (this.delay > 0) {
                    this.isWaiting = true;
                    this.delayInterval = setTimeout(this.resume, this.delay);
                }
            }

            if (this.yoyo) {
                this.reverseTweaks();
            }

        }

    };

    /**
     * For yoyo function - reverses "from" and "to"
     */
    Tw.prototype.reverseTweaks = function () {
        var i = 0;

        for (i = 0; i < this.twCommon.length; i++) {
            this.twCommon[i][1] = this.twCommon[i][1] + this.twCommon[i][2];
            this.twCommon[i][2] *= -1;
        }

        for (i = 0; i < this.twTransform.length; i++) {
            this.twTransform[i][1] = this.twTransform[i][1] + this.twTransform[i][2];
            this.twTransform[i][2] *= -1;
        }

        for (i = 0; i < this.tweaksColor.length; i++) {
            var col1 = this.tweaksColor[i][0];
            var col2 = this.tweaksColor[i][1];

            for (var j = 0; j < 4; j++) {
                col1[j] = col1[j] + col2[j];
                col2[j] *= -1;
            }
        }

    };


    Tw.prototype.renderCommon = function () {



        for (var i = 0; i < this.calcCommon.length; i++) {
            var p = this.calcCommon[i];
            if(p[0].match("scroll")) {
                this.obj[p[0]] = p[1];
            }
            else  if (this.style) {
                this.style[p[0]] = p[1] + p[2];
            } else {
                this.obj[p[0]] = p[1];
            }
        }
    };

    Tw.prototype.renderTransforms = function () {
        if (this.hasTranforms) {
            for (var i = 0; i < this.calcTransforms.length; i++) {
                var trans = this.transformsList.join(" ");
                this.style.transform = trans;
                this.style.webkitTransform = trans;
            }
        }
    };

    Tw.prototype.renderColors = function () {
        if (this.hasColor) {
            for (var i = 0; i < this.calcColors.length; i++) {
                var c = this.calcColors[i];
                if (c[1]) {
                    this.style[c[0]] = c[1];
                }
            }
        }
    };




    Tw.prototype._ = function (a, b) {
        this._thenArgs.push(arguments);
        return this;
    };

    Tw.prototype._then = function () {

        var args = this._thenArgs.shift();
        var fArg = args[0];

        var nextType = getNexType(args);

        switch (nextType) {
            case "chain" :
                this.t = 0;
                this.setup(this.obj, fArg, args[1], args[2]);
                break;
            case "func" :
                fArg();
                remove(this);
                break;
            case "new" :
                this.setup(fArg, args[1], args[2], args[3]);
                break;

            default :
                remove(this);

        }

    };


    /* ===================================================================================================
     SCOPE FUNCTIONS
     ====================================================================================================*/


    function remove(tween) {
        var ind = tweens.indexOf(tween);
        tween.stop();
        if (ind > -1) {
            tweens.splice(ind, 1);
        }
    }

    var td = 0;
    var d = 0;
    var last = 0;
    var step = 1 / 60;
    var lag = 0;

    function date() {
        return window.performance && window.performance.now ? window.performance.now() : new Date().getTime();
    }



    /**
     * Main loop. Will adjust for time lag.
     */
    function update() {

        var ts = tweens;
        var i;

        d = date();

        td = d - last;

        if (td > 200) {
            td = 0;
        }

        lag += Math.min(1, td / 1000);
        //console.log(td, lag)

        while (lag > step) {
            for (i = 0; i < ts.length; i++) {
                ts[i].update();
            }
            lag -= step;
        }


        for (i = 0; i < ts.length; i++) {
            ts[i].render();
        }

        last = d;

        if (ts.length > 0 && ! manualUpd) {
            requestAnimationFrame(update);
        } else {
            isRunning = false;
        }

        //console.log(ts.length, manualUpd)
    }


    function objectExists(obj) {
        for (var i = 0; i < tweens.length; i++) {
            if (tweens[i].obj === obj) {
                return i;
            }
        }
        return -1;
    }

    function isFunction(f) {
        var getType = {};
        return f && getType.toString.call(f) === '[object Function]';
    }


    function getColorTweak(tweak, compStyle) {

        var from, to;

        if (tweak.to.indexOf("#") === -1) {
            to = getColorArr(tweak.to);
        } else {
            to = hexToRGBA(tweak.to);
        }

        if (!tweak.from) {
            from = getColorArr(compStyle[tweak.prop]);
        } else {
            if (tweak.from.indexOf("#") === -1) {
                from = getColorArr(tweak.from);
            } else {
                from = hexToRGBA(tweak.from);
            }
        }

        for (var i = 0; i < from.length; i++) {
            to[i] = to[i] - from[i];
        }

        return [from, to, tweak.prop];

    }

    function getColorArr(strVal) {
        var cols = strVal.match(/[0-9.]+/g);
        cols.forEach(function (v, n) {
            cols[n] = parseFloat(v)
        });
        if (cols.length === 3) {
            cols.push(1);
        }
        return cols;
    }

    function hexToRGBA(hex) {
        hex = hex.replace("#", "");
        var bigint;// = parseInt(hex, 16);
        return [(bigint = parseInt(hex, 16)) >> 16 & 255, bigint >> 8 & 255, bigint & 255, 1];
    }


    function getTweak(obj, tweak, style, transArr, compStyle) {

        var from = parseFloat(tweak.from);
        var to = !isNaN(tweak.to) ? tweak.to : parseFloat(tweak.to);
        var prop = tweak.prop;
        var transPos = -1;


        var initVal = 0;


        var unit = tweak.unit || "px";
        if (isNaN(tweak.to) && typeof tweak.to !== "object") {
            unit = tweak.to.match(/[a-z%]+/)[0];
        }

        if (!style) {
            // Plain Object ---------
            if (tweak.from ) {
                from = tweak.from;
            }
            else {
                from = obj[prop];
            }
            to = to - from;
            return [tweak.prop, from, to, tweak.unit];
        } else {

            // Scroll --------------
            if (prop.match("scroll")) {

                var fromProp = (prop === "scrollTop")? "scrollTop" : "scrollLeft";
                var offset = (prop === "scrollTop")? "offsetTop" : "offsetLeft";
                from = obj[fromProp];

                if (typeof tweak.to === "string" || typeof tweak.to === "number") {
                    to = parseInt(tweak.to) - from;
                } else {
                    to = tweak.to[offset] - from;
                }
                return [prop, from, to, ""];
            }
            // Transform ------------
            else if (prop.match(regTrans)) {
                return (getTransform(tweak.prop, from, to, unit, transArr));
            // Opacity --------------
            } else if (prop.indexOf("opacity") > -1) {
                if (isNaN(from)) {
                    from = parseFloat(getComputedStyle(obj).opacity);
                }
                to = to - from;
                unit = "";
            // Common ---------------
            } else {
                initVal = parseFloat(style[prop]) || getCompStyle(compStyle, prop, unit, to);
                if (isNaN(from)) {
                    to = to - initVal;
                    from = initVal;
                } else {
                    to = to - from;
                    //to = to + initVal - from;
                }
            }
        }

        //console.log(prop, "initVal:"+initVal, "from:"+from, "to:"+to, "unit:"+unit)

        return [prop, from, to, unit, transPos];

    }

    function getCompStyle(style, prop, unit) {

        if (!style) {
            return 0;
        }


        var styleResult = style[prop];

        if (styleResult === "auto") {
            return 0;
        }

        var val = getNumber(style[prop]);

        switch (unit) {
            case "px" :
                return val;
            default:
                return 0;
        }


    }

    function getTransform(prop, from, to, unit, transArr) {
        var pos = getTransformPos(prop, transArr);
        var initVal;
        if (pos > -1) {
            initVal = getNumber(transArr[pos]);
        }

        if (prop.indexOf("translate") !== -1) {
            if (initVal === undefined) {
                initVal = 0;
            }
        } else if (prop.indexOf("scale") !== -1) {
            if (initVal === undefined) {
                initVal = 1;
            }
            unit = "";
        } else if (prop.match(/rotate|skew/i)) {
            if (initVal === undefined) {
                initVal = 0;
            }
            unit = "deg";
        }

        if (isNaN(from)) {
            from = 0;
            to = to - initVal + from;
            from = from + initVal;
        } else {
            to = to + initVal - from;
        }
        return [prop, from, to, unit, pos];

    }

    /**
     * Returns position of transform in transforms array or -1
     * @param prop
     * @param transArr
     * @returns {*}
     */
    function getTransformPos(prop, transArr) {
        for (var i = 0; i < transArr.length; i++) {
            var ind = transArr[i].indexOf(prop);
            if (ind > -1) {
                return i;
            }
        }
        return -1;
    }

    function getNumber(val) {
        return parseFloat(val.match(/[0-9.-]+/));
    }


    /**
     * Returns type of the chained object
     * @param args
     * @returns {*}
     */
    function getNexType(args) {
        var fArg = args[0];
        if (!isNaN(fArg)) {
            return "chain";
        } else if (isFunction(fArg)) {
            return "func";
        } else if (fArg instanceof Object && !isNaN(args[1]) && args[2] instanceof Object) {
            return "new";
        }
        return null;
    }

    /* ===================================================================================================
     TWEEN FUNCTIONS
     ====================================================================================================*/

    Tweak.easeIn = function (t, b, c, d) {
        return c * (t /= d) * t + b;
    };
    Tweak.easeOut = function (t, b, c, d) {
        return -c * (t /= d) * (t - 2) + b;
    };
    Tweak.easeInOut = function (t, b, c, d) {
        if ((t /= d * 0.5) < 1) return c * 0.5 * t * t + b;
        return -c * 0.5 * ((--t) * (t - 2) - 1) + b;
    };
    Tweak.linear = function (t, b, c, d) {
        return c * t / d + b;
    };
    Tweak.easeInCubic = function (t, b, c, d) {
        return c * (t /= d) * t * t + b;
    };
    Tweak.easeOutCubic = function (t, b, c, d) {
        return c * ((t = t / d - 1) * t * t + 1) + b;
    };
    Tweak.easeInOutCubic = function (t, b, c, d) {
        if ((t /= d * 0.5) < 1) return c * 0.5 * t * t * t + b;
        return c * 0.5 * ((t -= 2) * t * t + 2) + b;
    };
    Tweak.easeInOutExpo = function (t, b, c, d) {
        if (t === 0) return b;
        if (t === d) return b + c;
        if ((t /= d * 0.5) < 1) return c * 0.5 * Math.pow(2, 10 * (t - 1)) + b;
        return c * 0.5 * (-Math.pow(2, -10 * --t) + 2) + b;
    };
    Tweak.easeInExpo = function (t, b, c, d) {
        return (t === 0) ? b : c * Math.pow(2, 10 * (t / d - 1)) + b;
    };
    Tweak.easeOutExpo = function (t, b, c, d) {
        return (t === d) ? b + c : c * (-Math.pow(2, -10 * t / d) + 1) + b;
    };
    Tweak.easeOutElastic = function (t, b, c, d) {
        var s = 1.70158;
        var p = 0;
        var a = c;
        if (t === 0) return b;
        if ((t /= d) === 1) return b + c;
        if (!p) p = d * 0.3;
        if (a < Math.abs(c)) {
            a = c;
            s = p / 4;
        }
        else s = p / (2 * Math.PI) * Math.asin(c / a);
        return a * Math.pow(2, -10 * t) * Math.sin((t * d - s) * (2 * Math.PI) / p) + c + b;
    };
    Tweak.easeOutBounce = function (t, b, c, d) {
        if ((t /= d) < (1 / 2.75)) {
            return c * (7.5625 * t * t) + b;
        } else if (t < (2 / 2.75)) {
            return c * (7.5625 * (t -= (1.5 / 2.75)) * t + 0.75) + b;
        } else if (t < (2.5 / 2.75)) {
            return c * (7.5625 * (t -= (2.25 / 2.75)) * t + 0.9375) + b;
        } else {
            return c * (7.5625 * (t -= (2.625 / 2.75)) * t + 0.984375) + b;
        }
    };
    Tweak.easeInBack = function (t, b, c, d, s) {
        s = s | 1.70158;
        return c * (t /= d) * t * ((s + 1) * t - s) + b;
    };
    Tweak.easeOutBack = function (t, b, c, d, s) {
        s = s | 1.70158;
        return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
    };
    Tweak.easeInOutBack = function (t, b, c, d, s) {
        s = s | 1.70158;
        if ((t /= d / 2) < 1) return c / 2 * (t * t * (((s *= (1.525)) + 1) * t - s)) + b;
        return c / 2 * ((t -= 2) * t * (((s *= (1.525)) + 1) * t + s) + 2) + b;
    };


    scope.Tweak = scope.T = Tweak;

}(this || window));




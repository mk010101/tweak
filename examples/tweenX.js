/**
 * Created by maxk on 12/02/2015.
 *
 * Tween class.
 * Tween._(myObj, 1.5, [["s.width", 300], ["s.height", "5%", "20%"], ["t.rotateX", 60]], {delay:2});
 */
(function(global){
	"use strict";

	var tween = {};
	var _manager = new Manager();
	var fps = 60;

	/**
	 * Main method to start tweening
	 * @obj {Object} any object or DOM element
	 * @duration {Number} duration of tween in seconds
	 * @properties {Array} properties to tween. The form is [["propertyName", value]] or ["propertyName", from, to]
	 * If case only one numeric value is provided, the initial value is read from the object itself. Property name
	 * is either a name as in "scrollLeft", or a String in the form of "style.width", a shorthand version "s.width",
	 * or "transform.scaleX" ("t.scaleX) in case of Transforms. Colour transform is defined like this:
	 * ["s.color", "rgba(200, 43, 120, .5)"] or ["s.backgroundColor", "rgb(200, 43, 120)"].
	 * @settings {Object} Settings object is optional and defines behaviour and post-behaviour of the tween: easeFunction,
	 * yoyo, repeat, delay, onStart, onProgress, onComplete, onCompleteParams.
	 */
	tween.activate = tween._ = function(obj, duration, properties, settings)
	{


		var tw = new Tween(obj, duration, properties, settings);
		_manager.add(tw);
		return tw;
	};

	tween.killAll = function()
	{
		_manager.removeAll();
	};

	tween.kill = function($tween)
	{
		_manager.remove($tween);
	};

	tween.killTweensOf = function(obj)
	{
		_manager.killTweensOf(obj);
	};

	tween.getTweensOf = function(obj)
	{
		return _manager.getTweensOf(obj);
	};

	/* -----------------------------------------------------------------------------------------
	 CONSTRUCTOR
	 -------------------------------------------------------------------------------------------*/

	/**
	 * Constructor
	 * @param obj
	 * @param duration
	 * @param properties
	 * @param settings
	 * @constructor
	 */
	function Tween(obj, duration, properties, settings)
	{
		this.t = 0;
		this.obj = obj;
		this.params = [];
		this.persistTransforms = "";
		this.easeFunc = tween.easeInOut;
		this.repeat = 1;
		this.timeoutId = -1;
		//this.timeoutEndId = -1;
		this.delay = 0;
		this.repeatDelay = undefined;
		this.duration = duration * fps;
		this.keepAlive = false;
		this.overwrite = 0; // auto; only conflicting tweens are overwritten.
        this.ha = true;

		if (settings)
		{
			if (settings.delay !== undefined) this.delay = settings.delay * 1000;
			if (settings.repeatDelay !== undefined) this.repeatDelay = settings.repeatDelay * 1000;
			this.onStart = settings.onStart;
			this.onProgress = settings.onProgress;
			this.call = settings.call;
			this.onCompleteParams = settings.onCompleteParams;
			this.overwrite = (settings.overwrite === undefined)? 0 : settings.overwrite;
			this.yoyo = settings.yoyo;
			if(settings.repeat !== undefined) this.repeat = settings.repeat;
			if (settings.easeFunc !== undefined) this.easeFunc = settings.easeFunc;
			if (settings.keepAlive === true) this.keepAlive = true;
		}

		this.allowTween = (this.delay === undefined);
		//this.transformStr = (obj.style.transform === undefined)? "webkitTransform" : "transform";

		//this.init(properties)
		if (this.delay !== 0)
		{
			var self = this;
			self.timeoutId = setTimeout(this.init.bind(self, properties), this.delay);
		} else {
			this.init(properties);
		}

	}


	Tween.prototype.transformsList = "translateX translateY translateZ rotate rotateX rotateY rotateZ skewX skewY";

	Tween.prototype.kill = function()
	{
		clearTimeout(this.timeoutId);
		this.obj = null;
	};

	/* -----------------------------------------------------------------------------------------
	 INIT
	 -------------------------------------------------------------------------------------------*/

	Tween.prototype.init = function(properties)
	{
		var currentProp;
		var transforms = [];
		var begin, end;
		var propArr;
		var typeArr;
		var strStyle;
		var strProp;
		var updateProp; //color opacity translate rotate scale default (width, height, margin, left...)
		for (var i = 0; i < properties.length; i++)
		{
			propArr = properties[i];
			typeArr = propArr[0].split("."); // [s, left], [style, right]
			strStyle = typeArr[0];
			strProp = typeArr[1];
			begin = 0;
			end = 0;
            /*
            if (this.ha) {
                this.obj.style.transform = "translateZ(0deg)";
                this.obj.style.webkitTransform = "translateZ(0deg)";
            }
*/
			// STYLE ================================
			if (strStyle == "s" || strStyle == "style")
			{
				// width, height, margin, left... ----------------------------
				if (strProp !== "color" && strProp !== "backgroundColor")
				{
					updateProp = "default";
					if(propArr.length == 3) // Properties array contains "from" value
					{

						if (typeof propArr[1] === "number")
						{
							this.params.push([strProp, updateProp, propArr[1], propArr[2]-propArr[1], null]);
						} else {
							var unit = propArr[1].match(/[A-Za-z%]+/)[0];
							begin = parseFloat(propArr[1]);
							end = parseFloat(propArr[2]);
							this.params.push([strProp, updateProp, begin, end-begin, unit]);
						}
					} else {
						currentProp = getComputedStyle(this.obj, strProp);
						this.params.push([strProp, updateProp, currentProp, propArr[1]-currentProp]);
					}
				} else
				// color, backgroundColor ------------------
				{
					updateProp = "color";
					var colorArrays;
					if(propArr.length == 2)
					{
						colorArrays = getRBGArrays(this.obj,  propArr[1], strProp);
					} else {
						colorArrays = getRBGArrays(propArr[1],  propArr[2], null);
					}
					this.params.push([strProp, updateProp, colorArrays[0], colorArrays[1]]);
				}
			}
			// STYLE.TRANSFORM ================================
			else if (strStyle == "t" || strStyle == "transform")
			{
				var transObj = getTransforms.call(this, this.obj);
				transforms.push(strProp);
				switch (strProp)
				{
					case "translateX":
					case "translateY":
					case "translateZ":
						updateProp = "translate";
						begin = 0;
						break;
					case "rotate":
					case "rotateX":
					case "rotateY":
					case "rotateZ":
						updateProp = "rotate";
						begin = 0;
						break;
					case "scaleX":
					case "scaleY":
					case "scaleZ":
						begin = 1;
						updateProp = "scale";
						break;
					case "skewX":
					case "skewY":
						begin = 0;
						updateProp = "skew";
						break;
				}

				if (transObj !== null && transObj[strProp])
				{
					begin = transObj[strProp];
					end = propArr[1];
				}

				if(propArr.length == 3) // Properties array contains "from" value
				{
					begin = propArr[1];
					end = propArr[2];
					if (updateProp == "scale") end = propArr[2] - begin;

				} else {
					end = propArr[1];
					if (updateProp == "scale") end = propArr[1] - begin;
				}
				this.params.push([strProp, updateProp, begin, end]);
			}
			// DEFAULT =================================
			else if(propArr.length == 3) // Properties array contains "from" value
			{
				currentProp = propArr[1];
				this.params.push([propArr[0], "", currentProp, propArr[2]-currentProp]);
			} else {
				currentProp = this.obj[propArr[0]];
				this.params.push([propArr[0], "", currentProp, propArr[1]-currentProp]);
			}
		}

		this.persistTransforms = getPersistingTransforms.call(this, this.obj, transforms);

		if(this.onStart !== undefined) this.onStart.call(this, this);

		this.allowTween = true;

	};

	Tween.prototype.setDelay = function(delay)
	{
		if (delay !== undefined)
		{
			var self = this;
			self.timeoutId = setTimeout(this.timeoutHandler.bind(this), delay);
		}
	};

	Tween.prototype.timeoutHandler = function()
	{
		this.allowTween = true;
	};

	/* -----------------------------------------------------------------------------------------
	 UPDATE
	 -------------------------------------------------------------------------------------------*/

	Tween.prototype.update = function()
	{
		if (! this.allowTween) return;

		var useTransforms = false;
		var transString = "";
		var unit = "px";
		var p, style;

		for (var i = 0; i < this.params.length; i++)
		{
			var paramArr = this.params[i];
			p = paramArr[1];
			style = paramArr[0];
			switch (p)
			{
				case "default":
					if (style == "opacity") unit = "";
					if (paramArr[4] !== undefined && paramArr[4] !== null) unit = paramArr[4];
					this.obj.style[style] = this.easeFunc(this.t, paramArr[2], paramArr[3], this.duration) + unit;
					break;

				case "opacity":
					this.obj.style[style] = this.easeFunc(this.t, paramArr[2], paramArr[3], this.duration);
					break;

				case "color":
					var r = parseInt(this.easeFunc(this.t, paramArr[2][0], paramArr[3][0], this.duration));
					var g = parseInt(this.easeFunc(this.t, paramArr[2][1], paramArr[3][1], this.duration));
					var b = parseInt(this.easeFunc(this.t, paramArr[2][2], paramArr[3][2], this.duration));
					var a = this.easeFunc(this.t, paramArr[2][3], paramArr[3][3], this.duration);
					this.obj.style[style] = "rgba(" + r + "," + g + "," + b + "," + a + ")";
					break;

				case "translate":
					transString += style + "(" + this.easeFunc(this.t, paramArr[2], paramArr[3]-paramArr[2], this.duration) + "px)";
					useTransforms = true;
					break;
				case "scale":
					transString += style + "(" + this.easeFunc(this.t, paramArr[2], paramArr[3], this.duration) + ")";
					useTransforms = true;
					break;
				case "rotate":
				case "skew":
					transString += style + "(" + this.easeFunc(this.t, paramArr[2], paramArr[3]-paramArr[2], this.duration) + "deg)";
					useTransforms = true;
					break;

				default :
					this.obj[style] = this.easeFunc(this.t, paramArr[2], paramArr[3], this.duration);
					break;
			}

			if (useTransforms)
			{
				if (this.persistTransforms !== "" && this.persistTransforms !== null) transString += " " + this.persistTransforms;
				//this.obj.style[this.transformStr] = transString;
				this.obj.style.transform = transString;
				this.obj.style.webkitTransform = transString;
			}

		}

		if (this.onProgress)
		{
			this.onProgress.call(this, this);
		}

		this.t ++;
		if (this.t > this.duration)
		{

			if (this.repeatDelay !== undefined)
			{
				this.allowTween = false;
				this.setDelay(this.repeatDelay);
			}

			if (this.yoyo !== undefined)
			{
				reverse(this.params, this.transformsList);
			}

			if (this.callback) this.callback();

			if (this.repeat === 0)
			{
				this.t = 0;
			}
			else if (this.repeat > 1)
			{
				this.t = 0;
				this.repeat --;
			} else {
				if (this.call) this.call.call(this, this.onCompleteParams);
				this.allowTween = false;
				//if (this.keepAlive === false) _manager.remove(this);
				_manager.remove(this);
			}

		}

	};

	/* -----------------------------------------------------------------------------------------
	 EASING FUNCTIONS
	 -------------------------------------------------------------------------------------------*/

	tween.easeIn = function (t, b, c, d)
	{
		return c*(t/=d)*t + b;
	};
	tween.easeOut = function (t, b, c, d)
	{
		return -c *(t/=d)*(t-2) + b;
	};
	tween.easeInOut = function (t, b, c, d)
	{
		if ((t/=d *0.5) < 1) return c*0.5*t*t + b;
		return -c*0.5 * ((--t)*(t-2) - 1) + b;
	};

	tween.linear = function (t, b, c, d)
	{
		return c * t / d + b;
	};

	tween.easeInCubic = function (t, b, c, d)
	{
		return c*(t/=d)*t*t + b;
	};

	tween.easeOutCubic = function (t, b, c, d)
	{
		return c*((t=t/d-1)*t*t + 1) + b;
	};

	tween.easeInOutCubic = function (t, b, c, d) {
	if ((t/=d *0.5) < 1) return c*0.5*t*t*t + b;
		return c*0.5*((t-=2)*t*t + 2) + b;
	};

	tween.easeInOutExpo = function (t, b, c, d)
	{
		if (t===0) return b;
		if (t===d) return b+c;
		if ((t/=d *0.5) < 1) return c*0.5 * Math.pow(2, 10 * (t - 1)) + b;
		return c*0.5 * (-Math.pow(2, -10 * --t) + 2) + b;
	};

	tween.easeInExpo = function (t, b, c, d)
	{
		return (t===0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
	};

	tween.easeOutExpo = function (t, b, c, d)
	{
		return (t===d) ? b+c : c * (-Math.pow(2, -10 * t/d) + 1) + b;
	};

	tween.easeOutElastic = function (t, b, c, d)
	{
		var s=1.70158;
		var p=0;
		var a=c;
		if (t===0) return b; if ((t/=d)===1) return b+c; if (!p) p=d*0.3;
		if (a < Math.abs(c)) { a=c; s=p/4; }
		else s = p/(2*Math.PI) * Math.asin (c/a);
		return a*Math.pow(2,-10*t) * Math.sin( (t*d-s)*(2*Math.PI)/p ) + c + b;
	};

	tween.easeOutBounce = function (t, b, c, d)
	{
		if ((t/=d) < (1/2.75)) {
			return c*(7.5625*t*t) + b;
		} else if (t < (2/2.75)) {
			return c*(7.5625*(t-=(1.5/2.75))*t + 0.75) + b;
		} else if (t < (2.5/2.75)) {
			return c*(7.5625*(t-=(2.25/2.75))*t + 0.9375) + b;
		} else {
			return c*(7.5625*(t-=(2.625/2.75))*t + 0.984375) + b;
		}
	};

	tween.easeInBack = function (t, b, c, d, s)
	{
		s = s | 1.70158;
		return c*(t/=d)*t*((s+1)*t - s) + b;
	};

	tween.easeOutBack = function (t, b, c, d, s) {
		s = s | 1.70158;
		return c*((t=t/d-1)*t*((s+1)*t + s) + 1) + b;
	};

	tween.easeInOutBack = function (t, b, c, d, s) {
	s = s | 1.70158;
		if ((t/=d/2) < 1) return c/2*(t*t*(((s*=(1.525))+1)*t - s)) + b;
		return c/2*((t-=2)*t*(((s*=(1.525))+1)*t + s) + 2) + b;
	};




	/* -----------------------------------------------------------------------------------------
	HELPER FUNCTIONS
	 -------------------------------------------------------------------------------------------*/

	/**
	 * Returns existing computed style of a DOM object
	 * @param obj
	 * @param style
	 * @returns {Number}
	 */
	function getComputedStyle(obj, style)
	{
		var str =  window.getComputedStyle(obj)[style];
		if (str === "" || str == "auto") return 0;
		else if (style !== "opacity")
			return parseInt(str, 10);
		return parseFloat(str);
	}

	/**
	 * Extracts int values from an RGB(A) string
	 * @param str
	 * @returns {Array}
	 */
	function getRGB_fromStyle(str)
	{
		str = str.replace(/[a-zA-z() ]/g, "");
		var arr = str.split(",");
		for (var i = 0; i < arr.length; i++)
		{
			arr[i] = Number(arr[i]);
		}
		return arr;
	}

	/**
	 * Converts and normalizes colour values
	 * @param obj DOM object
	 * @param targetColor target RGB(A) string
	 * @param style style property, e.g. 'color' or 'backgroundColor'
	 * @returns {Array} array of 2 arrays [[r,g,b,a], [r,g,b,a]]
	 */
	function getRBGArrays(obj, targetColor, style)
	{
		var arr0;
		if (style !== null)
		{
			arr0 = getRGB_fromStyle(window.getComputedStyle(obj)[style]);
		} else {
			arr0 = getRGB_fromStyle(obj);
		}

		var arr1 = getRGB_fromStyle(targetColor);

		// RGBA -> RGB
		if (arr0.length == 4 && arr1.length == 3)
		{
			arr1[3] = arr0[3];
		}
		// RGB -> RGBA
		else if (arr0.length == 3 && arr1.length == 4)
		{
			arr0[3] = 1;
		}
		// RGB -> RGB
		else if (arr0.length == 3 && arr1.length == 3)
		{
			arr0[3] = 1;
			arr1[3] = 1;
		}
		for (var i = 0; i < 4; i++)
		{
			arr1[i] = arr1[i] - arr0[i];
		}
		return [arr0, arr1];
	}

	/**
	 * Reverses parameters for "yoyo" option
	 * @param propertiesArr
	 * @param transformsStr
	 */
	function reverse(propertiesArr, transformsStr)
	{

		var tmp, items, p;
		for (var i = 0; i < propertiesArr.length; i++)
		{
			items = propertiesArr[i];
			p = propertiesArr[i][0];
			if(typeof items[2] === "number")
			{
				tmp = items[2];
				if(transformsStr.indexOf(p) === -1)
				{
					items[2] = items[3] + items[2];
					items[3] = tmp - items[2];
				} else {
					items[2] = items[3];
					items[3] = tmp;
				}

			}
			// colour array
			else if (items[2] instanceof Array){
				for (var j = 0; j < 4; j++)
				{
					tmp = items[2][j];
					items[2][j] = items[3][j] + items[2][j];
					items[3][j] = tmp - items[2][j];
				}
			}
		}
	}

	/**
	 *
	 * @param obj
	 * @returns {Object}
	 */
	function getTransforms(obj)
	{
		var str = obj.style.transform;
		if (str === undefined) str = obj.style.webkitTransform;
		if(str === "") return null;
		var props = str.split(" ");
		var transObj = {};
		for (var i = 0; i < props.length; i++)
		{
			var v =  props[i];
			var p = v.substr(0, v.indexOf("("));
			transObj[p] = Number( v.match(/[0-9.-]+/g)[0]);
		}
		return transObj;
	}

	function getPersistingTransforms(obj, transforms)
	{
		if (obj.style) var str = obj.style.transform;
		if (obj.style && str === undefined) str = obj.style.webkitTransform;
		if(! str) return null;
		var props = str.split(" ");
		var arr = [];
		for (var i = 0; i < props.length; i++)
		{
			var current = props[i];
			if (check(current))
			{
				arr.push(current);
			}
		}


		function check(target)
		{
			for (var j = 0; j < transforms.length; j++)
			{
				if (target.indexOf(transforms[j]) !== -1) return false;
			}
			return true;
		}
		if (arr.length === 0) return "";
		return arr.join(" ");
	}

	/* -----------------------------------------------------------------------------------------
	 Tween Manager
	 -------------------------------------------------------------------------------------------*/

	function Manager()
	{
		this.tweens = [];
		this._allow = false;
		this._isRunning = false;
		//this.alive = [];
	}

	Manager.prototype.add = function($tween)
	{
		this.tweens.push($tween);
		this._allow = true;
		if (! this._isRunning)
		{
			this._isRunning = true;
			this.run();
		}
	};

	Manager.prototype.remove = function($tween)
	{
		var ind = this.tweens.indexOf($tween);
		if (ind != -1)
		{
			clearTimeout($tween.timeoutId);
			this.tweens.splice(ind, 1);
		}
		if (this.tweens.length === 0)
		{
			this._allow = false;
			this._isRunning = false;
		}
	};

	Manager.prototype.run = function()
	{
		for(var i = this.tweens.length-1; i >= 0; i--)
		{
			this.tweens[i].update();
		}
		if (this._allow)
		{
			requestAnimationFrame(this.run.bind(this));
		}
	};

	Manager.prototype.removeAll = function()
	{
		this._allow = false;
		this._isRunning = false;
		for (var i = 0; i < this.tweens.length; i++)
		{
			this.tweens[i].kill();

		}
		this.tweens = [];
	};

	Manager.prototype.killTweensOf = function(obj)
	{
		for (var i = this.tweens.length-1; i >= 0; i--)
		{
			var tw = this.tweens[i];
			if (tw.obj === obj)
			{
				tw.kill();
				this.tweens.splice(i, 1);
			}
		}
	};

	Manager.prototype.getTweensOf = function (obj)
	{
		var i = this.tweens.length-1;
		var arr = [];
		while (i >= 0)
		{
			if (this.tweens[i].obj === obj)
			{
				arr.push(this.tweens[i]);
			}
			i--;
		}
		if (arr.length === 0) return null;
		return arr;
	};

/*
	if (typeof define === "function")
	{
		define(function(){
			return tween;
		});
	} else {
		global.Tween = tween;
	}
	*/
	global.Tween = tween;


}(this));
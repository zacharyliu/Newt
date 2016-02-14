"use strict";

requirejs.config({
    baseUrl: 'js',
    paths: {
        node: 'node_modules'
    }
});

// Start the main app logic.
requirejs(['async', 'node/interval-tree/IntervalTree', 'node/alike/main'],
    function (async, intervalTree, alike) {
        //jQuery, canvas and the app/sub module are all
        //loaded and can be used here now.
        var current_token;
        var user_data;
        var calendars;
        var events = [];
        var itree = new intervalTree(Date.now() / 10000);
        var weatherData;
        var linkData;

        var re = /^(?:ftp|https?):\/\/(?:[^@:\/]*@)?([^:\/]+)/;

        function get_history(callback) {
            console.log("get_history");
            var d = new Date();
            var max_start = Date.now();
            var min_start = d.setMonth(d.getMonth() - 1);
            // get history data
            chrome.history.search({
                text: "",
                startTime: min_start,
                endTime: max_start,
                maxResults: 1e6
            }, function (results) {
                var visits = [];
                async.each(results, function (result, callback) {
                    chrome.history.getVisits({
                        url: result.url
                    }, function (items) {
                        Array.prototype.push.apply(visits, items.map(function (item) {
                            return {
                                url: result.url,
                                title: result.title,
                                visitTime: item.visitTime
                            };
                        }));
                        callback();
                    });
                }, function (err) {
                    if (typeof callback === 'function') {
                        callback(err, visits);
                    }
                });
            });
        }

        var sites = {};
        var edges = {};

        var prevVisit;
        function pushVisit (end) {
            var start = prevVisit;

            // create link
            var startHost = getHost(start.url);
            var endHost = getHost(end.url);

            if (!edges[startHost]) edges[startHost] = {};
            if (!edges[startHost][endHost]) edges[startHost][endHost] = 0;
            edges[startHost][endHost]++;

            prevVisit = end;
        }

        function getHost(url) {
            var result = url.match(re);
            if (result && result.length > 1) {
                return result[1];
            } else {
                return "";
            }
        }

        function init() {
            console.log("init()", "Initializing");

            function getWeather() {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(function (position) {
                        $.ajax({
                            url: "http://api.openweathermap.org/data/2.5/weather?units=imperial&lat=" + position.coords.latitude + "&lon=" + position.coords.longitude,
                            success: function (data) {
                                console.log("init()", "Got weather data");
                                weatherData = data;
                            }
                        });
                    });
                }
            }

            setInterval(function () {
                getWeather();
            }, 10 * 60 * 1000);
            getWeather();

            get_history(function (err, visits) {
                console.log("init()", "Got history data");

                console.log(visits.length);

                visits.forEach(function (item) {
                    var date = new Date(item.visitTime);
                    var obj = dateToObj(date);
                    obj.url = item.url;
                    obj.title = item.title;
                    obj.visitTime = item.visitTime;
                    var host = getHost(item.url);
                    if (!sites.hasOwnProperty(host)) {
                        sites[host] = [];
                    }
                    sites[host].push(obj);
                });

                prevVisit = visits[0];
                for (var i = 1; i < visits.length; i++) {
                    var end = visits[i];
                    pushVisit(end);
                }

                console.log(edges);

                function dateToObj(date) {
                    var obj = {};
                    obj.dayOfWeek = date.getDay() / 7;
                    obj.minutesPastMidnight = (date.getHours() * 60 + date.getMinutes()) / (60 * 24);
                    obj.minutesPastNoon = (((date.getHours() + 12) % 24) * 60 + date.getMinutes()) / (60 * 24);
                    return obj;
                }

                var distance = function (p1, p2, opts) {
                    var attr, dist, val, x, y;
                    dist = 0;
                    for (attr in p1) {
                        val = p1[attr];
                        x = val;
                        y = p2[attr];
                        if ((opts != null ? opts.stdv : void 0) && Object.getOwnPropertyNames(opts.stdv).length > 0 && opts.stdv[attr] !== 0) {
                            x /= opts.stdv[attr];
                            y /= opts.stdv[attr];
                        }
                        if ((opts != null ? opts.weights : void 0) && Object.getOwnPropertyNames(opts.weights).length > 0) {
                            x *= opts.weights[attr];
                            y *= opts.weights[attr];
                        }
                        dist += Math.pow(x - y, 2);
                    }
                    return dist;
                };

                function compareEvents(current, pastArray) {
                    var allEvents = {};
                    var commonEvents = [];
                    pastArray.forEach(function (past) {
                        past.forEach(function (event) {
                            allEvents[event.data[2]] = true;
                        });
                    });
                    current.forEach(function (event) {
                        var eventName = event.data[2];
                        if (allEvents[eventName] && !(eventName in commonEvents)) {
                            commonEvents.push(eventName);
                        }
                    });
                    return commonEvents;
                }

                function titleForHost(host) {
                    let site = sites[host];
                    var title = site[0].title;
                    var shortestUrlLength = site[0].url.length;
                    for (let i = 1; i < site.length; i++) {
                        if (site[i].url.length < shortestUrlLength) {
                            shortestUrlLength = site[i].url.length;
                            title = site[i].title;
                        }
                    }

                    return title;
                }

                function getLinks(callback) {
                    var testObj = dateToObj(new Date(Date.now()));
                    var currentEvents = itree.search(Date.now() / 10000); // convert to 10 second resolution
                    var results = [];
                    for (var host in sites) {
                        // Limit only to sites with at least 20 visits, and skip blank
                        if (sites[host].length < 20 || host == '') {
                            continue;
                        }

                        var options = {
                            k: 5,
                            weights: {
                                dayOfWeek: 2,
                                minutesPastMidnight: 1,
                                minutesPastNoon: 1
                            }
                        };

                        var knnResults = alike(testObj, sites[host], options);

                        var score = 0;
                        for (var i = 0; i < knnResults.length; i++) {
                            score += distance(testObj, knnResults[i]);
                        }
                        var commonEvents = compareEvents(currentEvents, knnResults.map(function (visit) {
                            return itree.search(visit.visitTime / 10000); // convert to 10 second resolution
                        }));
                        if (commonEvents.length > 0) {
                            score -= 1.5;
                        }
                        results.push({
                            host: host,
                            title: titleForHost(host),
                            score: score,
                            commonEvents: commonEvents
                        });
                    }
                    results.sort(function (a, b) {
                        return a.score - b.score;
                    });
                    results = results.slice(0, 20);
                    console.log(results);

                    linkData = results;
                    if (typeof callback === 'function') {
                        callback(err, results);
                    }

                }

                // setInterval(function () {
                //     getLinks();
                // }, 60 * 1000);
                // getLinks();

                chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
                    console.log("init()", "Incoming message", request, sender);
                    if (request.action == "getLinks") {
                        if (request.refresh) {
                            getLinks(function (err, linkData) {
                                sendResponse(linkData);
                            });
                        }
                        sendResponse(linkData);
                    } else if (request.action == "getWeather") {
                        sendResponse(weatherData);
                    } else if (request.action == "getGraph") {
                        var hosts = Object.keys(edges);
                        var nodes = [];
                        var hostsToGroup = {};
                        for (var i = 0; i < hosts.length; i++) {
                            nodes.push({name: hosts[i], group: i});
                            hostsToGroup[hosts[i]] = i;
                        }

                        var newEdges = [];
                        for (var i = 0; i < hosts.length; i++) {
                            var destHosts = edges[hosts[i]];
                            for (var destHost in destHosts) {
                                var weight = destHosts[destHost];
                                newEdges.push({from: hostsToGroup[hosts[i]], to: hostsToGroup[destHost], weight: weight});
                            }
                        }
                        var response = {nodes: nodes, edges: newEdges};
                        console.log("getGraph response", response);
                        sendResponse(response);
                    }
                });
            });

        }

        init();
    });


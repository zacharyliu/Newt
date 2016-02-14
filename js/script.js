var RADIUS = Math.min(window.innerWidth, window.innerHeight)/60;
var graph = {
    "nodes": [
        {"name": "google.com", "group": -1},
        {"name": "facebook.com", "group": 0},
        {"name": "stuff.com", "group": 1}
    ],
    "edges": [
        {"source": 0, "target": 1},
        {"source": 1, "target": 2}
    ]
}

var width = window.innerWidth,
    height = window.innerHeight;

var color = d3.scale.category20();

var force = d3.layout.force()
    .charge(-3000)
    .linkDistance(RADIUS*20)
    .size([width, height]);

var svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);


var drawGraph = function(graph) {
  console.log(graph)
  /*graph.edges = graph.edges.filter(function (node) {
    return node.weight > 1
  })*/

  force
      .nodes(graph.nodes)
      .links(graph.edges)
      
      .start();

  var link = svg.selectAll(".link")
      .data(graph.edges)
    .enter().append("line")
      .attr("class", "link")
      .style("stroke-width", function(d) { return Math.sqrt(d.value); });

  var gnodes = svg.selectAll('g.gnode')
     .data(graph.nodes)
     .enter()
     .append('g')
     .classed('gnode', true);
    
  var node = gnodes
      .append('a')
      .attr("xlink:href", function(d) {return 'http://' + d.name })
      .append("circle")
      .attr("class", function (d) {
        if (d.group == 0) {
          return "node center-node"
        }
        return "node";
      })
      .attr("r", function(d) { 
        /*if (d.group == 0) {
          return 1.5*RADIUS
        }*/
        return RADIUS*Math.log(d.weight + 1)
      })
      .style("fill", function(d) { return color(d.group); })
      .each(function (node) {
        if (node.group == 0) {
            node.fixed = true;
            node.px = width / 2;
            node.py = height / 2;
        }
        if (node.group == -1) {
            node.px = width/2 - 100;
            node.py = height / 2;
        }
        if (node.group == 1) {
            node.px = width / 2 + 100
            node.py = height / 2;
        }
      })
      .call(force.drag);

  var labels = gnodes.append("text")
      .append('a')
      .attr("xlink:href", function(d) {return 'http://' + d.name })
      .text(function(d) { return d.name; });

  force.on("tick", function() {
    link.attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; });

    gnodes.attr("transform", function(d) { 
        return 'translate(' + [d.x, d.y] + ')'; 
    });
  })
};


chrome.runtime.sendMessage({action: "getGraph"}, function (response) {
    console.log("getGraph response", response);

    drawGraph(response);
});

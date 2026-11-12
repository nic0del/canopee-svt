const label = /^(probl[ée]matique|question directrice|contexte|objectifs?|consigne(?:s)?|production attendue|mat[ée]riel|questions?)\s*[:：]/i;
const section = /^(?:partie\s+\w+\b|document\s+\d+\b|[IVX]+\s*[.\-–]|\d+[.)]\s*)/i;
const bullet = /^[●•▪]\s*/;

export function assemblePDFLines(lines) {
  const blocks = [];
  let current;
  for (const line of lines) {
    const value = line.text.trim();
    if (!value) continue;
    const listItem = bullet.test(value);
    const previous = current?.last;
    const leading = previous ? line.y - previous.y : 0;
    const continuesHeading = current?.heading && line.heading && !section.test(value) && !label.test(value) &&
      leading < Math.max(19, previous.height * 1.65) && Math.abs(line.x-previous.x)<18;
    const nextBlock = !continuesHeading && (!current || line.breakBefore || label.test(value) || section.test(value) || listItem || line.heading ||
      (previous && (leading > Math.max(16, previous.height * 1.65) || line.heading !== previous.heading ||
        Math.abs(line.x - previous.x) > Math.max(18, previous.height * 1.5))));
    if (nextBlock) {
      current = {text: value.replace(bullet, ''), heading: line.heading, y: line.y, last: line};
      blocks.push(current);
    } else {
      current.text += ' ' + value;
      current.last = line;
    }
  }
  return blocks.map(({text, heading, y}) => ({text, heading, y}));
}

export function nativePDFLines(items, viewport) {
  const rows = [];
  for (const item of items) {
    const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const height = Math.hypot(item.transform[2], item.transform[3]) || 10;
    let row = rows.find(candidate => Math.abs(candidate.y - y) < 2.5);
    if (!row) {
      row = {y, height, items: []};
      rows.push(row);
    }
    row.height = Math.max(row.height, height);
    row.items.push({x, text: item.str});
  }
  const sizes = rows.map(row => row.height).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 10;
  return rows.sort((a, b) => a.y - b.y).map(row => {
    row.items.sort((a, b) => a.x - b.x);
    const text = row.items.map(item => item.text.trim()).join(' ');
    return {text, y: row.y, x: row.items[0].x, height: row.height, heading: row.height > median * 1.25 && text.length < 110};
  });
}

const identity = [1, 0, 0, 1, 0, 0];
const transform = ([a,b,c,d,e,f], [g,h,i,j,k,l]) => [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f];

export function pdfImageRegions(operatorList, ops, viewport) {
  const {fnArray, argsArray} = operatorList;
  const stack = [], regions = [];
  let matrix = identity;
  for (let index = 0; index < fnArray.length; index++) {
    const op = fnArray[index], args = argsArray[index];
    if (op === ops.save || op === ops.paintFormXObjectBegin) {
      stack.push(matrix);
      if (op === ops.paintFormXObjectBegin && args?.[0]) matrix = transform(matrix, args[0]);
    } else if (op === ops.restore || op === ops.paintFormXObjectEnd) {
      matrix = stack.pop() ?? identity;
    } else if (op === ops.transform) {
      matrix = transform(matrix, args);
    } else if (op === ops.paintImageXObject || op === ops.paintInlineImageXObject) {
      const [a,b,c,d,e,f] = matrix;
      const points = [[e,f],[a+e,b+f],[c+e,d+f],[a+c+e,b+d+f]].map(point => viewport.convertToViewportPoint(...point));
      const left = Math.max(0, Math.min(...points.map(point => point[0])));
      const top = Math.max(0, Math.min(...points.map(point => point[1])));
      const right = Math.min(viewport.width, Math.max(...points.map(point => point[0])));
      const bottom = Math.min(viewport.height, Math.max(...points.map(point => point[1])));
      const width = right-left, height = bottom-top;
      if (width < 45 || height < 35 || width*height > viewport.width*viewport.height*.87) continue;
      if (!regions.some(region => Math.abs(region.left-left)+Math.abs(region.top-top)+Math.abs(region.width-width)+Math.abs(region.height-height)<5)) {
        regions.push({left,top,width,height});
      }
    }
  }
  return regions.sort((a,b) => a.top-b.top || a.left-b.left);
}

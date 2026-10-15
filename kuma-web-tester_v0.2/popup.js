// ---------- Парсер выражений ----------

class Parser {
  constructor(input, variables) {
    this.tokens = this.tokenize(input);
    this.pos = 0;
    this.variables = variables;
  }

  tokenize(str) {
    const tokens = [];
    const re = /\s*(=>|>=|<=|!=|==|[()+\-*/%,.]|'[^']*'|"[^"]*"|[A-Za-z_$][A-Za-z0-9_$.]*|\d+(?:\.\d+)?|\S)/g;
    let m;
    while ((m = re.exec(str)) !== null) {
      if (m[1]) tokens.push(m[1]);
    }
    return tokens;
  }

  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }
  expect(t) {
    const tok = this.next();
    if (tok !== t) throw new Error(`Ожидалось "${t}", получено "${tok}"`);
  }

  parse() {
    const expr = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error(`Неожиданный токен: "${this.peek()}"`);
    }
    return expr;
  }

  parseExpression() {
    let left = this.parseTerm();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.next();
      const right = this.parseTerm();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseTerm() {
    let left = this.parseFactor();
    while (this.peek() === '*' || this.peek() === '/' || this.peek() === '%') {
      const op = this.next();
      const right = this.parseFactor();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  parseFactor() {
    const tok = this.peek();

    if (tok === undefined) throw new Error('Неожиданный конец выражения');

    // Число
    if (/^\d/.test(tok)) {
      this.next();
      return { type: 'number', value: parseFloat(tok) };
    }

    // Строка в кавычках
    if (tok.startsWith("'") || tok.startsWith('"')) {
      this.next();
      return { type: 'string', value: tok.slice(1, -1) };
    }

    // Функция или переменная
    if (/^[A-Za-z_$]/.test(tok)) {
      const name = this.next();
      if (this.peek() === '(') {
        this.next();
        const args = [];
        if (this.peek() !== ')') {
          args.push(this.parseExpression());
          while (this.peek() === ',') {
            this.next();
            args.push(this.parseExpression());
          }
        }
        this.expect(')');
        return { type: 'call', name, args };
      }
      return { type: 'var', name };
    }

    // Скобки
    if (tok === '(') {
      this.next();
      const expr = this.parseExpression();
      this.expect(')');
      return expr;
    }

    throw new Error(`Неожиданный токен: "${tok}"`);
  }
}

// ---------- Вычисление ----------

function evaluate(node, vars) {
  switch (node.type) {
    case 'number': return node.value;
    case 'string': return node.value;
    case 'var': {
      const name = node.name;
      if (name in vars) return vars[name];
      throw new Error(`Переменная "${name}" не задана`);
    }
    case 'binary': {
      const l = evaluate(node.left, vars);
      const r = evaluate(node.right, vars);
      const ln = typeof l === 'number' ? l : parseFloat(l) || 0;
      const rn = typeof r === 'number' ? r : parseFloat(r) || 0;
      switch (node.op) {
        case '+': return ln + rn;
        case '-': return ln - rn;
        case '*': return ln * rn;
        case '/': return rn === 0 ? 0 : ln / rn;
        case '%': return rn === 0 ? 0 : ln % rn;
      }
      break;
    }
    case 'call':
      return callFunction(node.name, node.args, vars);
  }
  throw new Error(`Неизвестный узел: ${node.type}`);
}

// ---------- Реализация функций KUMA ----------

function callFunction(name, argNodes, vars) {
  const args = argNodes.map(n => evaluate(n, vars));

  switch (name) {
    // ----- Строковые -----
    case 'len':
      if (typeof args[0] === 'string') return args[0].length;
      if (Array.isArray(args[0])) return args[0].length;
      return String(args[0]).length;

    case 'to_lower':
      return String(args[0]).toLowerCase();

    case 'to_upper':
      return String(args[0]).toUpperCase();

    case 'append':
      return String(args[0]) + String(args[1]);

    case 'prepend':
      return String(args[1]) + String(args[0]);

    case 'substring': {
      const s = String(args[0]);
      const start = parseInt(args[1], 10) || 0;
      if (args.length >= 3) {
        const end = parseInt(args[2], 10);
        return s.substring(start, end);
      }
      return s.substring(start);
    }

    case 'index_of':
      return String(args[1]).indexOf(String(args[0]));

    case 'last_index_of':
      return String(args[1]).lastIndexOf(String(args[0]));

    case 'tr': {
      const s = String(args[0]);
      const chars = args.length >= 2 ? String(args[1]) : ' ';
      let start = 0, end = s.length;
      while (start < end && chars.includes(s[start])) start++;
      while (end > start && chars.includes(s[end - 1])) end--;
      return s.substring(start, end);
    }

    case 'replace':
      return String(args[0]).split(String(args[1])).join(String(args[2]));

    case 'regexp_replace': {
      const re = new RegExp(String(args[1]), 'g');
      return String(args[0]).replace(re, String(args[2]));
    }

    case 'regexp_capture': {
      const re = new RegExp(String(args[1]));
      const m = String(args[0]).match(re);
      return m ? m[0] : '';
    }

    case 'str_join': {
      const sep = String(args[0]);
      return args.slice(1).map(String).join(sep);
    }

    case 'template': {
      if (args.length === 1) {
        return String(args[0]).replace(/\{\{\.(\w+)\}\}/g, (_, v) => {
          return vars[v] !== undefined ? String(vars[v]) : '';
        });
      }
      return String(args[0]).replace(/\{\{index \. (\d+)\}\}/g, (_, i) => {
        const idx = parseInt(i, 10) + 1;
        return idx < args.length ? String(args[idx]) : '';
      });
    }

    // ----- Массивы -----
    case 'distinct_items': {
      const arr = Array.isArray(args[0]) ? args[0] : String(args[0]).split('');
      return [...new Set(arr)];
    }

    case 'sort_items': {
      const arr = Array.isArray(args[0]) ? [...args[0]] : String(args[0]).split('');
      const dir = args[1] === 'desc' ? -1 : 1;
      arr.sort((a, b) => {
        if (a < b) return -1 * dir;
        if (a > b) return 1 * dir;
        return 0;
      });
      return arr;
    }

    case 'item': {
      const idx = parseInt(args[1], 10);
      if (Array.isArray(args[0])) return args[0][idx] ?? '';
      return String(args[0])[idx] ?? '';
    }

    case 'math_min': {
      const arr = Array.isArray(args[0]) ? args[0] : [args[0]];
      return Math.min(...arr.map(Number));
    }

    case 'math_max': {
      const arr = Array.isArray(args[0]) ? args[0] : [args[0]];
      return Math.max(...arr.map(Number));
    }

    case 'math_avg': {
      const arr = Array.isArray(args[0]) ? args[0] : [args[0]];
      const nums = arr.map(Number);
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    }

    // ----- Математические -----
    case 'round':
      return Math.round(Number(args[0]));

    case 'ceil':
      return Math.ceil(Number(args[0]));

    case 'floor':
      return Math.floor(Number(args[0]));

    case 'abs':
      return Math.abs(Number(args[0]));

    case 'pow':
      return Math.pow(Number(args[0]), Number(args[1]));

    // ----- Условные -----
    case 'conditional': {
      const cond = String(args[0]);
      const trueVal = args[1];
      const falseVal = args[2];

      let result = false;

      if (/\s+AND\s+/i.test(cond)) {
        const parts = cond.split(/\s+AND\s+/i);
        result = parts.every(p => evalSimpleCondition(p, vars));
      } else if (/\s+OR\s+/i.test(cond)) {
        const parts = cond.split(/\s+OR\s+/i);
        result = parts.some(p => evalSimpleCondition(p, vars));
      } else {
        result = evalSimpleCondition(cond, vars);
      }

      return result ? trueVal : falseVal;
    }

    // ----- Время (упрощённо) -----
    case 'now':
      return Date.now();

    case 'parse_timestamp':
      return new Date(String(args[0])).getTime();

    case 'format_timestamp': {
      const d = new Date(Number(args[0]));
      return d.toISOString();
    }

    case 'extract_from_timestamp': {
      const d = new Date(Number(args[0]));
      const fmt = String(args[1]);
      switch (fmt) {
        case 'y': return d.getUTCFullYear();
        case 'M': return d.getUTCMonth() + 1;
        case 'd': return d.getUTCDate();
        case 'h': return d.getUTCHours();
        case 'm': return d.getUTCMinutes();
        case 's': return d.getUTCSeconds();
        case 'wd': return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getUTCDay()];
        default: return '';
      }
    }

    case 'time_diff': {
      const end = Number(args[0]);
      const start = Number(args[1]);
      const unit = args[2] || 'ms';
      const diff = end - start;
      switch (unit) {
        case 'ms': return diff;
        case 's': return Math.floor(diff / 1000);
        case 'm': return Math.floor(diff / 60000);
        case 'h': return Math.floor(diff / 3600000);
        case 'd': return Math.floor(diff / 86400000);
        default: return diff;
      }
    }

    case 'truncate_timestamp': {
      const ts = Number(args[0]);
      const unit = args[1] || '1s';
      const ms = { '1s': 1000, '1m': 60000, '1h': 3600000, '24h': 86400000 }[unit] || 1000;
      return Math.floor(ts / ms) * ms;
    }

    default:
      throw new Error(`Функция "${name}" не реализована`);
  }
}

function evalSimpleCondition(cond, vars) {
  const m = cond.match(/^\s*(\S+)\s*(=|!=|LIKE|ILIKE)\s*(.+?)\s*$/i);
  if (!m) return false;

  const field = m[1].trim();
  const op = m[2].toUpperCase();
  const val = m[3].trim().replace(/^['"]|['"]$/g, '');

  const fieldVal = vars[field] !== undefined ? String(vars[field]) : field;

  switch (op) {
    case '=': return fieldVal === val;
    case '!=': return fieldVal !== val;
    case 'LIKE': {
      const re = new RegExp('^' + val.replace(/%/g, '.*').replace(/_/g, '.') + '$');
      return re.test(fieldVal);
    }
    case 'ILIKE': {
      const re = new RegExp('^' + val.replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
      return re.test(fieldVal);
    }
  }
  return false;
}

// ---------- UI ----------

const varsContainer = document.getElementById('varsContainer');
const resultDiv = document.getElementById('result');
const expressionInput = document.getElementById('expression');

function addVarRow(name = '', value = '') {
  const row = document.createElement('div');
  row.className = 'var-row';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Имя';
  nameInput.value = name;
  nameInput.className = 'var-name';

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.placeholder = 'Значение';
  valueInput.value = value;
  valueInput.className = 'var-value';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = '×';
  delBtn.title = 'Удалить переменную';
  delBtn.addEventListener('click', () => {
    row.remove();
  });

  row.appendChild(nameInput);
  row.appendChild(valueInput);
  row.appendChild(delBtn);

  varsContainer.appendChild(row);
}

function getVars() {
  const vars = {};
  const rows = varsContainer.querySelectorAll('.var-row');
  rows.forEach(row => {
    const name = row.querySelector('.var-name').value.trim();
    const value = row.querySelector('.var-value').value;
    if (name) vars[name] = value;
  });
  return vars;
}

document.getElementById('addVar').addEventListener('click', () => addVarRow());

document.getElementById('evaluate').addEventListener('click', () => {
  const expr = expressionInput.value.trim();
  if (!expr) return;

  try {
    const vars = getVars();
    const parser = new Parser(expr, vars);
    const ast = parser.parse();
    const result = evaluate(ast, vars);

    if (Array.isArray(result)) {
      resultDiv.textContent = JSON.stringify(result);
    } else {
      resultDiv.textContent = String(result);
    }
    resultDiv.classList.remove('error');
  } catch (e) {
    resultDiv.textContent = 'Ошибка: ' + e.message;
    resultDiv.classList.add('error');
  }
});

// Одна переменная по умолчанию
addVarRow('DeviceCustomString1', 'Hello World');

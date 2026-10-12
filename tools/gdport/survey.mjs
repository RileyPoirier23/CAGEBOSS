import ts from 'typescript';
import fs from 'fs';
import path from 'path';
const files = process.argv.slice(2);
const counts = {};
const inc = (k) => (counts[k] = (counts[k] ?? 0) + 1);
for (const f of files) {
  const src = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
  const visit = (n) => {
    const k = ts.SyntaxKind[n.kind];
    if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment && !ts.isExpressionStatement(n.parent) && !(ts.isForStatement(n.parent))) inc('assign-in-expr');
    if ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) && (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken) && !ts.isExpressionStatement(n.parent) && !ts.isForStatement(n.parent)) inc('incdec-in-expr');
    if (['TryStatement','LabeledStatement','ForInStatement','ForOfStatement','SwitchStatement','SpreadElement','SpreadAssignment','ArrayBindingPattern','ObjectBindingPattern','RegularExpressionLiteral','TemplateExpression','TaggedTemplateExpression','GetAccessor','SetAccessor','ClassDeclaration','YieldExpression','AwaitExpression','DeleteExpression','TypeOfExpression','ConditionalExpression','ArrowFunction','FunctionExpression','NonNullExpression','AsExpression','OptionalChain','ThrowStatement','DoStatement','WhileStatement','EnumDeclaration','ComputedPropertyName','QuestionQuestionToken','InKeyword','InstanceOfKeyword','CommaToken','VoidExpression'].includes(k)) inc(k);
    if (ts.isPropertyAccessExpression(n) && n.questionDotToken) inc('?.');
    if (ts.isNewExpression(n)) inc('new ' + n.expression.getText());
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) inc('.' + n.expression.name.text + '()');
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.CommaToken) inc('comma-expr');
    ts.forEachChild(n, visit);
  };
  visit(src);
}
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}\t${k}`).join('\n'));

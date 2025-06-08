var createError = require('http-errors');
var express = require('express');
const path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const session = require('express-session');
const boardRouter = require('./routes/board');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
const userRouter = require('./routes/user');
const productRouter = require('./routes/products');
const cartRouter = require('./routes/cart');
const orderRouter = require('./routes/order');
const wishlistRouter = require('./routes/wishlist'); // wishlistRouter import

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'))); // 여기 한 번만 존재해야 함!
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
}));

// 아래 미들웨어 위치는 app.use('/', indexRouter); 보다 위에 있어야 함
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// 모든 라우트 정의
app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/user',userRouter);
app.use('/board', boardRouter);
app.get('/login', (req,res)=> {
  res.redirect('/user/login');
});
app.use('/products',productRouter);
app.use('/cart', cartRouter);
app.use('/order',orderRouter);
app.use('/wishlist', wishlistRouter); // /wishlist 경로로 접근


// catch 404 and forward to error handler
// 이 부분이 모든 라우트 처리 이후에 와야 합니다.
app.use(function(req, res, next) {
  next(createError(404)); // http-errors 모듈을 사용하여 404 에러 생성
});

// error handler (4개의 인자를 받는 미들웨어)
// 이 부분이 모든 라우트 및 일반 미들웨어 뒤에, 그리고 다른 에러 핸들러 앞에 와야 합니다.
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// **가장 마지막에 있었던 404 핸들러는 위 `createError(404)`와 `error handler` 조합으로 대체되므로 필요 없습니다.**

module.exports = app;
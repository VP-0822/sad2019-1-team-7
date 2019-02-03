const bcrypt = require('bcryptjs');
const passport = require('passport');
const randomstring = require("randomstring");
var crypto = require('crypto');
var async = require('async');
const mail = require('../../config/mail');

//Bring in User Model
let User = require('../../models/user');

// login process
exports.login=function(req, res, next){
    passport.authenticate('local',{
        successRedirect:'/welcome',
        failureRedirect:'/users/login',
        failureFlash: true
    })(req,res, next);
};

exports.logout = function(req, res){
    req.logout();
    res.redirect('/users/login');
    return;
}

exports.register=function(req, res){
    const firstname = req.body.firstname;
    const lastname = req.body.lastname;
    const email = req.body.email;
    const dob = req.body.dob;
    const matriculation = req.body.matriculation;
    const password = req.body.password;
    const confirm = req.body.confirm;
    const userId = randomstring.generate(10);

    req.checkBody('firstname', 'First name is required').notEmpty();
    req.checkBody('lastname', 'Last name is required').notEmpty();
    req.checkBody('email', 'Email is required').notEmpty();
    req.checkBody('email', 'Email is not valid').isEmail();
    req.checkBody('dob','Date of Birth is required').notEmpty();
    req.checkBody('matriculation','Matriculation Number is required').notEmpty();
    req.checkBody('password','Password is required').notEmpty();
    req.checkBody('password', 'Password provided doesn\'t match password criteria').isValidPassword();
    req.checkBody('confirm','Passwords do not match').equals(req.body.password);

    let errors = req.validationErrors();
    
    if(errors){
        if(errors)
        {
            req.flash('error',errors[0].msg);
        }
        //res.redirect('/users/register');
        req.render('/register');
        return;
    } else {
        var newUser = new User({
            firstname: firstname,
            lastname: lastname,
            email: email,
            dob: dob,
            matriculation:matriculation,
            password: password,
            userId: userId
        });

        bcrypt.genSalt(10, function(err, salt){
            bcrypt.hash(newUser.password,salt, function(err, hash){
                if(err){
                    console.log(err);
                }
                newUser.password = hash;
                newUser.save(function(err){
                    if(err){
                        console.log(err);
                        return;
                    }
                    else{
                        req.flash('success','You are successfully registered!');
                        res.redirect('/users/login');
                        return;
                    }
                });
            });
        });
    }
}

exports.getUserProfile = function(req, res, userId, handleSuccessResponse, handleErrorResponse){
    if(userId)
    {
        User.find({userId : userId}, { password: 0}).lean().exec(function(err, result){
            if(err)
            {
                handleErrorResponse(req, res, err)
                return
            }
            handleSuccessResponse(req, res, result)
        })
        return
    }
    handleErrorResponse(req, res, new Error('User id not provided'))
}

exports.sendSecurityToken = function(req, res, next, email, handleSuccessResponse, handleErrorResponse)
{
    if(email)
    {
        
        async.waterfall([
            function (done) {
                crypto.randomBytes(20, function (err, buf) {
                    var token = buf.toString('hex');
                    done(err, token);
                });
            },
            function (token, done) {
                User.findOne({
                    email: email
                }, function (err, user) {
                    if (!user) {
                        handleErrorResponse(req, res,'No account with that email address exists.');
                        return;
                    }
    
                    user.resetPasswordToken = token;
                    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
                    user.save(function (err) {
                        done(err, token, user);
                    });
                });
            },
            function (token, user, done) {
                mail.sendTokenEmail(req, res, token, user, done);
            }
        ], function (err) {
            if (err) return next(err);
            handleSuccessResponse(req, res);
        });
        return;
    }
    handleErrorResponse(req, res)
}

exports.verifySecurityToken = function(req, res, token, handleSuccessResponse, handleErrorResponse){
    if(token)
    {
        User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: {
                $gt: Date.now()
            }
        }, function (err, user) {
            if (!user) {
                handleErrorResponse(req, res, 'Password reset token is invalid or has expired.');
                return;
            }
            handleSuccessResponse(req, res);
        });
        return;
    }
    handleErrorResponse(req, res)
}

exports.resetPassword = function(req, res, token, password, handleSuccessResponse, handleErrorResponse){
    async.waterfall([
        function (done) {
            User.findOne({
                resetPasswordToken: token,
                resetPasswordExpires: {
                    $gt: Date.now()
                }
            }, function (err, user) {
                if (!user) {
                    handleErrorResponse(req, res, 'Password reset token is invalid or has expired.');
                    return;
                }
                req.checkBody('password', 'Password is required').notEmpty();
                req.checkBody('password', 'Password provided doesn\'t match password criteria').isValidPassword();
                req.checkBody('confirm', 'Passwords do not match').equals(password);
                
                let errors = req.validationErrors();

                if (errors) {
                    handleErrorResponse(req, res, errors[0].msg);
                    return;
                } else {
                    user.password = password;
                    user.resetPasswordToken = undefined;
                    user.resetPasswordExpires = undefined;
                    bcrypt.genSalt(10, function (err, salt) {
                        bcrypt.hash(user.password, salt, function (err, hash) {
                            if (err) {
                                handleErrorResponse(req, res, err);
                            }
                            user.password = hash;
                            user.save(function (err) {
                                done(err, user);
                            });
                        });
                    });
                }
            });
        },
        function (user, done) {
            mail.resetPasswordConfirmation(req, res, user, done);
        }
    ], function (err) {
        handleSuccessResponse(req, res);
    });
}
//module.exports = {register: require('.')}
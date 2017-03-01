import request from 'supertest';
import chai from 'chai';
import session from 'supertest-session';
import app from '../src/server/server.js';

var testName = 'Fourth Test';
var expect = chai.expect;

describe('Profile and Doc Route Tests', function() {
  var agent = request.agent(app);
  var testSession;

  beforeEach(function() {
    testSession = session(app);
  });
  // write tests trying to grab a private doc as both the correct logged in user and not
  describe('Get a doc', function() {
    it('someone else should not grab my private doc', function(done) {
      testSession.post('/api/auth/login')
        .send({ email: 'Tim@gmail.com', password: 'Tim' })
        .end(function(err, res) {
          if (res.error) {
            console.log('login error ', res.error);
          } else {
            console.log('no error');
            testSession
              .get('/profile/Sim/7')
              .end(function(err, res) {
                expect(res.body.who).to.equal('not me');
                console.log('response ', res.body)
                done();
              });
          }
        });        
    });
    xit('should grab my private doc', function(done) {
      testSession.post('/api/auth/login')
        .send({ email: 'Sim@gmail.com', password: 'Sim' })
        .end(function(err, res) {
          if (res.error) {
            console.log('login error ', res.error);
          } else {
            console.log('no error');
            testSession
              .get('/profile/Sim/7')
              .end(function(err, res) {
                expect(res.body.who).to.equal('me');
                console.log('response ', res.body)
                done();
              });
          }
        });        
    });
  });

  xdescribe('Get all docs from a user', function() {
    it('should grab a profile', function(done) {
      testSession
        .get('/profile/Sim')
        .end(function(err, res) {
          console.log('is there an error ?', err);
          expect(res.body.who).to.equal('not me');
          console.log('response ', res.body)
          done();
        });       
    });
    it('should grab my profile', function(done) {
      testSession.post('/api/auth/login')
        .send({ email: 'Sim@gmail.com', password: 'Sim' })
        .end(function(err, res) {
          if (res.error) {
            console.log('login error ', res.error);
          } else {
            console.log('no error');
            testSession
              .get('/profile/Sim')
              .end(function(err, res) {
                expect(res.body.who).to.equal('me');
                console.log('response ', res.body)
                done();
              });
          }
        });        
    });
    it('should grab someone else\'s profile', function(done) {
      testSession.post('/api/auth/login')
        .send({ email: 'Tim@gmail.com', password: 'Tim' })
        .end(function(err, res) {
          if (res.error) {
            console.log('login error ', res.error);
          } else {
            console.log('no error');
            testSession
              .get('/profile/Sim')
              .end(function(err, res) {
                expect(res.body.who).to.equal('not me');
                console.log('response ', res.body)
                done();
              });
          }
        });        
    });
  });

});

describe('Doc Tests', function() {
  var agent = request.agent(app);
  var testSession;

  beforeEach(function() {
    testSession = session(app);
  });

  xdescribe('New Doc', function() {
    xit('should make a public doc', function(done) {
      agent
        .post('/api/doc/createDoc')
        .send({username: 'Sim', docName: testName, docDescription: 'This is the test', docType: 'public'})
        .end(function(err, res) {
          expect(res.body.docName).to.equal(testName);
          done();
        });
    });
    it('should make a private doc', function(done) {
      agent
        .post('/api/doc/createDoc')
        .send({username: 'Sim', docName: testName, docDescription: 'This is the test', docType: 'private'})
        .end(function(err, res) {
          expect(res.body.docName).to.equal(testName);
          done();
        });
    });
  });

  xdescribe('Save Doc', function() {
    it('should work without commit message', function(done) {
      agent
        .post('/api/doc/saveDoc')
        .send({username: 'Sim', docName: testName, docContent: 'Overwriting the text 1', commitMessage: ''})
        .end(function(err, res) {
          console.log('saved ', res.body);
          // expect(res.text).to.equal('Saved');
          done();
        });
    });
    xit('should work with commit message', function(done) {
      agent
        .post('/api/doc/saveDoc')
        .send({username: 'Sim', docName: testName, docContent: 'Overwriting the text 2', commitMessage: 'Testing commit'})
        .end(function(err, res) {
          // expect(res.text).to.equal('Saved');
          done();
        });
    });
  });
  
  xdescribe('Copy Doc', function() {
    it('should work', function(done) {
      agent
        .post('/api/doc/copyDoc')
        .send({docOwner: 'Sim', docName: testName, username: 'Tim'})
        .end(function(err, res) {
          expect(Array.isArray(res.body.allDocuments)).to.equal(true);
          done();
        });
    });
  });

  xdescribe('Open Doc', function() {
    it('should work', function(done) {
      agent
        .post('/api/doc/openDoc')
        .send({username: 'Sim', docName: testName})
        .end(function(err, res) {
          console.log('opened ', res.body);
          // expect(res.body.docText).to.equal('Overwriting the text 2');
          done();
        });
    });
  });
  xdescribe('Review Upstream', function() {
    it('should work', function(done) {
      agent
        .post('/api/doc/reviewUpstream')
        .send({username: 'Tim', docName: testName})
        .end(function(err, res) {
          console.log('res.body: ', res.body);
          // expect(res.body.docText).to.equal('Overwriting the text 2');
          done();
        });
    });
  });
  xdescribe('Get Upstream', function() {
    it('should work when there\'s no merge conflict', function(done) {
      agent
        .post('/api/doc/saveDoc')
        .send({username: 'Sim', docName: testName, docContent: 'Overwriting the origin for something to be pulled', commitMessage: ''})
        .end(function(err, res) {
          agent
            .post('/api/doc/getUpstream')
            .send({username: 'Tim', docName: testName})
            .end(function(err, res) {
              console.log('res.text: ', res.text, res. body);
              done();
            });
        });
    });
    it('should work despite merge conflict', function(done) {
      agent
        .post('/api/doc/saveDoc')
        .send({username: 'Sim', docName: testName, docContent: 'Overwriting the text a \nasdfth time', commitMessage: ''})
        .end(function(err, res) {
          agent
            .post('/api/doc/saveDoc')
            .send({username: 'Tim', docName: testName, docContent: 'drones \nThis is it \nAgain time', commitMessage: ''})
            .end(function(err, res) {
              agent
                .post('/api/doc/getUpstream')
                .send({username: 'Tim', docName: testName})
                .end(function(err, res) {
                  console.log('res.text: ', res.text, res.body);
                  done();
                });
            });
        });
    });
  });

  xdescribe('Get All Docs', function() {
    it('should work', function(done) {
      agent
        .get('/api/doc/allDocs')
        .end(function(err, res) {
          console.log('this is the res.body: ', res.body);
          // expect(res.body).to.equal();
          done();
        });
    });
  });

  xdescribe('Request Merge', function() {
    it('should work without commit message', function(done) {
      agent
        .post('/api/doc/saveDoc')
        .send({username: 'Tim', docName: testName, docContent: 'Doing an overwrite\nSo that I can \nTry to merge this in', commitMessage: ''})
        .end(function(err, res) {
          console.log('saved ', res.body);
          var latestCommit = res.body.currentCommit;
          // expect(res.text).to.equal('Saved');
          agent
            .post('/api/doc/requestMerge')
            .send({username: 'Tim', docName: testName, collaboratorMessage: 'Helping', commitID: latestCommit})
            .end(function(err, res) {
              expect(res.text).to.equal('Pull request sent');
              done();
            });
        });
    });
    xit('should work', function(done) {
      agent
        .post('/api/doc/requestMerge')
        .send({username: 'Tim', docName: testName, collaboratorMessage: 'Helping', commitID: 'INSERT'})
        .end(function(err, res) {
          expect(res.text).to.equal('Pull request sent');
          done();
        });
    });
  });
  xdescribe('Review Pull Request', function() {
    it('should work', function(done) {
      agent
        .post('/api/doc/reviewPullRequest')
        .send({commitID: '31875cbef6fb670c25ae85ea7ca848bb3e65e7f9'})
        .end(function(err, res) {
          console.log('res.body: ', res.body);
          // expect(res.text).to.equal('Pull request sent');
          done();
        });
    });
  });
  xdescribe('Action Pull Request', function() {
    it('should accept', function(done) {
      agent
        .post('/api/doc/actionPullRequest')
        .send({commitID: '31875cbef6fb670c25ae85ea7ca848bb3e65e7f9', ownerMessage: 'Thanks', mergeStatus: 'accept'})
        .end(function(err, res) {
          console.log('res.body: ', res.body);
          // expect(res.text).to.equal('Pull request sent');
          done();
        });
    });
    xit('should decline', function(done) {
      agent
        .post('/api/doc/actionPullRequest')
        .send({commitID: '4a41c49373204ca91a6ec2a7a392374bd876d85a', ownerMessage: 'Nope', mergeStatus: 'decline'})
        .end(function(err, res) {
          console.log('res.body: ', res.body);
          // expect(res.text).to.equal('Pull request sent');
          done();
        });
    });
  });

  xdescribe('Checkout past version', function() {
    it('should work', function(done) {
      agent
        .post('/api/doc/pastVersion')
        .send({commitID: 'f912e43ed93ffde7ca4031f1c97e28f2d829948c'})
        .end(function(err, res) {
          console.log('res.body: ', res.body);
          // expect(res.text).to.equal('Pull request sent');
          done();
        });
    });
  });
});

          
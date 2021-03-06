var User = require('./schema.js').User;
var Doc = require('./schema.js').Doc;
var DocVersion = require('./schema.js').DocVersion;
var DocPermission = require('./schema.js').DocPermission;
var PullRequest = require('./schema.js').PullRequest;

var NodeGit = require('nodegit');
var path = require('path');
var promisify = require('promisify-node');
var fse = promisify(require('fs-extra'));
fse.ensureDir = promisify(fse.ensureDir);

// pull
var exec = require('child_process').exec;

// diff
var jsdiff = require('diff');

var filesFolder = 'documents';

function specificDoc(req, res, next) {
  console.log('specificDoc params: ', req.params);
  var user, doc, pullRequests;
  var text, commits, currentCommit;
  var repository;

  Doc.findOne({ where: {id: req.params.docId, docOwner: req.params.username} })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    // console.log('found doc', foundDoc.dataValues);
    doc = foundDoc.dataValues; 
    console.log('here is the doc ');
    if (doc.public === false && (!req.user || !(req.user.username === req.params.username))) {
      console.log('You don\'t have permission to view this doc');
      return Promise.reject('You don\'t have permission to view this doc');
    } 
      
    return PullRequest.findAll({ where: {status: 'open', upstreamDocId: req.params.docId, targetUsername: req.params.username} }) 
  })    

  .then(function(foundPullRequests){
    console.log('found open pull requests (if they exist)');
    pullRequests = foundPullRequests.map(instance => {
      return {
        docOwner: instance.dataValues.targetUsername, 
        username: instance.dataValues.requesterName, 
        docName: instance.dataValues.docName,  
        collaboratorMessage: instance.dataValues.collaboratorMessage, 
        mergeStatus: instance.dataValues.status, 
        commitID: instance.dataValues.commitId, 
        ownerMessage: ''
      }
    });
    return DocVersion.findAll({ where: {docId: doc.id} })
  })
  .then(function(foundCommits){
    console.log('found commits ');
    commits = foundCommits.map((instance) => {
      return {
        id: instance.dataValues.id,
        commitID: instance.dataValues.commitID,
        commitMessage: instance.dataValues.commitMessage
      }
    });

    // console.log('reduced commits to send later ', commits);
    return NodeGit.Repository.open(doc.filepath)
  })
  .then(function(repo) {
    repository = repo;
    console.log('found repo');
    return NodeGit.Reference.nameToId(repository, 'HEAD')
  })
  .then(function(oid) {
    currentCommit = oid.tostrS();
    return fse.readFile(path.join(repository.workdir(), doc.name + '.txt'), 'utf8');
  })
  .then(function(data) {
    console.log('read contents ', data);
    text = data;
    var type = doc.public === true ? 'public' : 'private';
    console.log('confirm doctype');
    res.send({
      docID: doc.id,
      docOwner: doc.docOwner,
      docName: doc.name, 
      docDescription: doc.description,
      docType: type,
      parentID: doc.originId,
      originOwner: doc.originOwner,
      filePath: doc.filepath,
      docContent: text,
      docCommits: commits,
      currentCommit: currentCommit,
      pullRequests: pullRequests
    });
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
}

function allDocsForUser(req, res, next) {
  //req.params
  var user, docs;
  var docsObject = {};
  console.log('in the route handler', req.params);

  User.findOne({ where: {username: req.params.username } })
  .then(function(foundUser) {
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    user = foundUser.dataValues;
    console.log('found user in db ');
    if (req.user && req.user.username === req.params.username) {
      console.log('this is you');
      return Doc.findAll({ where: {docOwner: req.params.username } })
    } else if (!req.user || !(req.user.username === req.params.username)) {
      console.log('this is not you');
      return Doc.findAll({ where: {docOwner: req.params.username, public: true } })
    } 
  })
  .then(function(foundDocs) {
    console.log('queried for docs')
    docs = foundDocs.map(instance => {
      var type = instance.dataValues.public === true ? 'public' : 'private';
      return {
        docID: instance.dataValues.id,
        docOwner: instance.dataValues.docOwner,
        docName: instance.dataValues.name, 
        docDescription: instance.dataValues.description,
        docType: type,
        parentID: instance.dataValues.originId,
        originOwner: instance.dataValues.originOwner,
        filePath: instance.dataValues.filepath,
        docContent: '',
        docCommits: [],
        currentCommit: '',
        pullRequests: []
      }
    });
    return PullRequest.findAll({ where: {targetUsername: user.username, status: 'open'} })
  })
  .then(function(foundPullRequests) {
    if (foundPullRequests) {
      foundPullRequests.forEach(instance => {
        for (var i = 0; i < docs.length; i++) {
          if (docs[i].docID === instance.dataValues.upstreamDocId) {
            docs[i].pullRequests.push('pull request');
          }
        }
      })
    }
    docsObject.both = docs;
    docsObject.owned = docs.filter(doc => {
      return doc.parentID === null;
    });
    docsObject.contributing = docs.filter(doc => {
      return doc.parentID !== null;
    });
    res.send({username: req.params.username, userDocuments: docsObject});
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
}

function allDocs(req, res, next) {
  var docs;
  console.log('requesting all docs');
  Doc.findAll({ where: {public: true } })
  .then(function(allD) {
    console.log('found all docs ');
    docs = allD.map(instance => {
      var type = instance.dataValues.public === true ? 'public' : 'private';
      return {
        docID: instance.dataValues.id,
        docOwner: instance.dataValues.docOwner,
        docName: instance.dataValues.name, 
        docDescription: instance.dataValues.description,
        docType: type,
        parentID: instance.dataValues.originId,
        originOwner: instance.dataValues.originOwner,
        filePath: instance.dataValues.filepath,
        docContent: '',
        docCommits: [],
        currentCommit: ''
      }
    });
    res.send({allDocuments: docs});
  })
}

function retrieveDocsAndPullRequests(username, callback) {
  var user, docs, myDocs, pullRequests;
  var myDocsObject = {};
  console.log('in the login docs retrieval handler');
  User.findOne({ where: {username: username } })
  .then(function(foundUser) {
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return res.end('User doesn\'t exist');
    } 
    user = foundUser.dataValues;
    console.log('found user in db ');
    return Doc.findAll()
  })
  .then(function(allDocs) {
    console.log('found all docs');

    docs = allDocs.map(instance => {
      var type = instance.dataValues.public === true ? 'public' : 'private';
      return {
        docID: instance.dataValues.id,
        docOwner: instance.dataValues.docOwner,
        docName: instance.dataValues.name, 
        docDescription: instance.dataValues.description,
        docType: type,
        parentID: instance.dataValues.originId,
        originOwner: instance.dataValues.originOwner,
        filePath: instance.dataValues.filepath,
        docContent: '',
        docCommits: [],
        currentCommit: ''
      }
    });
    myDocs = docs.filter(doc => {
      return doc.docOwner === user.username;
    });
    myDocsObject.both = myDocs;

    myDocsObject.owned = myDocs.filter(doc => {
      return doc.parentID === null;
    });
    myDocsObject.contributing = myDocs.filter(doc => {
      return doc.parentID !== null;
    });
    // console.log(myDocsObject);
    return PullRequest.findAll({ where: {targetUsername: user.username, status: 'open'} })
  })
  .then(function(foundPullRequests) {
    console.log('found pull requests db ');
    pullRequests = foundPullRequests.map(instance => {
      return {
        docOwner: instance.dataValues.targetUsername, 
        username: instance.dataValues.requesterName, 
        docName: instance.dataValues.docName,  
        collaboratorMessage: instance.dataValues.collaboratorMessage, 
        mergeStatus: 'open', 
        commitID: instance.dataValues.commitId, 
        ownerMessage: ''
      }
    });
    // console.log({allDocuments: docs,
    //   allMyDocuments: myDocsObject,
    //   pullRequestsToMe: pullRequests
    // })
    // console.log('these are the both docs', myDocsObject.both);
    // console.log('these are the owned docs', myDocsObject.owned);
    // console.log('these are the contributing docs', myDocsObject.contributing);
    callback(docs, myDocsObject, pullRequests);
  })
}

// CHECK VARIABLE NAMES
function createDoc(req, res, next) {
  // console.log('POST request received on /api/doc/createDoc');
  console.log('req body ', req.body);
  var firstCommit;
  var user, pathToDoc, commitID;
  var repository;
  var index;
  var doc = {
    name: req.body.docName,
    description: req.body.docDescription,
    public: req.body.docType === 'public' ? 1 : 0
  }; 
  if (!req.user || !(req.user.username === req.body.username)) {
    console.log('You are not logged in at that username');
    return res.end('You are not logged in at that username');
  }
  // get userID
  return User.findOne({ where: {username: req.body.username } })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('User doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('found user ');
    user = foundUser.dataValues;
    // make sure the user doesn't already have a doc with the same name
    return Doc.findOne({ where: {name: req.body.docName, userID: user.id} }) 
  })
  .then(function(foundDoc){
    console.log('does it already exist')
    if (foundDoc) {
      console.log('doc already exists');
      return Promise.reject('You already have a doc with that name');
    } 
    console.log('make doc');
    var docName = doc.name;
    NodeGit.Repository.init(path.resolve(__dirname, filesFolder, user.username, docName), 0)
    .then(function(repo) {
      repository = repo;
      return fse.writeFile(path.join(repository.workdir(), docName + '.txt'), '');
    })
    .then(function(){
      return repository.index();
    })
    .then(function(idx) {
      index = idx;
    })
    .then(function() {
      return index.addByPath(docName+ '.txt');
    })
    .then(function() {
      return index.write();
    })
    .then(function() {
      return index.writeTree();
    })
    .then(function(oid) {
      var who = NodeGit.Signature.now(user.username, user.email);

      return repository.createCommit("HEAD", who, who, "Create document", oid, []);
    })
    .then(function(commit) {
      console.log('successful commit ');
      commitID = commit.tostrS();
      console.log('file made')
      pathToDoc = path.resolve(__dirname, filesFolder, user.username, docName);
      Doc.build({
        name: doc.name,
        description: doc.description,
        filepath: pathToDoc,
        public: doc.public,
        userId: user.id,
        docOwner: user.username,
        originId: null,
        originOwner: null
      })
      .save()
      .then(function(madeDoc) { 
        console.log('put into database');
        doc = madeDoc;
        DocVersion.build({
          commitID: commitID,
          commitMessage: "Create document",
          docId: doc.id,
          userId: user.id
        })
        .save()
        .then(function(madeDocVersion) { 
          firstCommit = madeDocVersion;
          DocPermission.build({
            docId: doc.id,
            userId: user.id,
            type: 'owner'
          })
          .save()
          .then(function(madeDocPermission) { 
            var type = doc.public === true ? 'public' : 'private';
            res.send({
              docID: doc.id,
              docOwner: user.username,
              docName: doc.name, 
              docDescription: doc.description,
              docType: type,
              parentID: null,
              originOwner: doc.originOwner,
              filePath: doc.filepath,
              docContent: '',
              docCommits: [firstCommit],
              currentCommit: commitID
            }); 
          })
        })
      })
    })
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};

function saveDoc(req, res, next) {
  console.log('req body ', req.body);
  // {username, doc name, doc text, optional commit message}
  var user, doc, commitID, comment, commits;

  var repository, index, oid;
  if (!req.user || !(req.user.username === req.body.username)) {
    console.log('You are not logged in at that username');
    return res.end('You are not logged in at that username');
  }

  return User.findOne({ where: {username: req.body.username } })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('found user ');
    user = foundUser.dataValues;
    // make sure the user doesn't already have a doc with the same name
    return Doc.findOne({ where: {name: req.body.docName, userID: user.id} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    doc = foundDoc.dataValues; 
    console.log('save doc');
    NodeGit.Repository.open(doc.filepath)
    .then(function(repo) {
      repository = repo;
      return fse.writeFile(path.join(repository.workdir(), doc.name + '.txt'), req.body.docContent);
    })
    .then(function(){
      return repository.index();
    })
    .then(function(idx) {
      index = idx;
    })
    .then(function() {
      return index.addByPath(doc.name + '.txt');
    })
    .then(function() {
      return index.write();
    })
    .then(function() {
      return index.writeTree();
    })
    .then(function(oidResult) {
      oid = oidResult;
      return NodeGit.Reference.nameToId(repository, "HEAD");
    })
    .then(function(head) {
      return repository.getCommit(head);
    })
    .then(function(parent) {
      var who = NodeGit.Signature.now(user.username, user.email);
      comment = req.body.commitMessage || new Date().toLocaleString();

      return repository.createCommit("HEAD", who, who, comment, oid, [parent]);
    })
    .then(function(commit) {
      console.log('successful commit ', commit);
      commitID = commit.tostrS();
      // console.log(commit.tostrS(), typeof commit.tostrS());
      DocVersion.build({
        commitID: commitID,
        commitMessage: comment,
        docId: doc.id,
        userId: user.id
      })
      .save()
      .then(function(madeDocVersion) {
        return DocVersion.findAll({ where: {docId: doc.id} })
      })
      .then(function(foundCommits) {
        commits = foundCommits.map((instance) => {
          return {
            id: instance.dataValues.id,
            commitID: instance.dataValues.commitID,
            commitMessage: instance.dataValues.commitMessage
          }
        });
        res.send({
          docCommits: commits, 
          currentCommit: commitID
        });
      })
    });
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};


function copyDoc(req, res, next) {
  console.log('req body ', req.body);
  // {username, username and doc name of target doc}
  var currentUser, docOwner, targetDoc, copiedDoc, pullRequests;
  var newFilepath, repo, text, index, oid, comment, commitID;

  if (!req.user || !(req.user.username === req.body.username)) {
    console.log('You are not logged in at that username');
    return res.end('You are not logged in at that username');
  }

  return User.findOne({ where: {username: req.body.docOwner } })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('found user ');
    docOwner = foundUser.dataValues;
    return Doc.findOne({ where: {name: req.body.docName, userID: docOwner.id} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    targetDoc = foundDoc.dataValues; 
    console.log('found target doc');
    return User.findOne({ where: {username: req.body.username } })
  })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('found user ');
    currentUser = foundUser.dataValues;
    // make sure the user doesn't already have a doc with the same name
    return Doc.findOne({ where: {name: req.body.docName, userID: currentUser.id} }) 
  })
  .then(function(foundDoc){
    if (foundDoc) {
      console.log('doc already exists');
      return Promise.reject('You already have a doc with that name');
    }
    newFilepath = path.resolve(__dirname, filesFolder, currentUser.username, targetDoc.name);
    NodeGit.Clone(targetDoc.filepath, newFilepath)
    .then(function(repository) {
      console.log('Cloned repo ', repository);
      repo = repository;
      Doc.build({
        name: targetDoc.name,
        description: targetDoc.description,
        filepath: newFilepath,
        public: targetDoc.public,
        userId: currentUser.id,
        docOwner: currentUser.username,
        originId: targetDoc.id,
        originOwner: targetDoc.docOwner
      })
      .save()
      .then(function(madeDoc) { 
        console.log('put into database');
        copiedDoc = madeDoc.dataValues;
        DocPermission.build({
          docId: madeDoc.id,
          userId: currentUser.id,
          type: 'owner'
        })
        .save()
        .then(function(madeDocPermission) {
          console.log('put permission in db');
          return fse.readFile(path.join(repo.workdir(), targetDoc.name + '.txt'), 'utf8');
        })
        .then(function(data) {
          text = data + '\n';
          return fse.writeFile(path.join(repo.workdir(), targetDoc.name + '.txt'), text);
        })
        .then(function(){
          return repository.index();
        })
        .then(function(idx) {
          index = idx;
        })
        .then(function() {
          return index.addByPath(targetDoc.name + '.txt');
        })
        .then(function() {
          return index.write();
        })
        .then(function() {
          return index.writeTree();
        })
        .then(function(oidResult) {
          oid = oidResult;
          return NodeGit.Reference.nameToId(repo, "HEAD");
        })
        .then(function(head) {
          return repository.getCommit(head);
        })
        .then(function(parent) {
          var who = NodeGit.Signature.now(currentUser.username, currentUser.email);
          comment = `Copied from ${docOwner.username} at ${new Date().toLocaleString()}`;

          return repository.createCommit("HEAD", who, who, comment, oid, [parent]);
        })
        .then(function(commit) {
          console.log('successful commit ', commit);
          commitID = commit.tostrS();
          DocVersion.build({
            commitID: commitID,
            commitMessage: comment,
            docId: copiedDoc.id,
            userId: currentUser.id
          })
          .save()
          .then(function(madeDocVersion) { 
            console.log('put first commit in db');
            // doc type and commit
            var type = copiedDoc.public === true ? 'public' : 'private';
            res.send({
              docID: copiedDoc.id,
              docOwner: copiedDoc.docOwner,
              docName: copiedDoc.name, 
              docDescription: copiedDoc.description,
              docType: type,
              parentID: copiedDoc.originId,
              filePath: copiedDoc.filepath,
              docContent: text,
              docCommits: [{
                id: madeDocVersion.dataValues.id,
                commitID: madeDocVersion.dataValues.commitID,
                commitMessage: madeDocVersion.dataValues.commitMessage
              }],
              currentCommit: commitID,
              originOwner: docOwner.username,
              pullRequests: []
            });
          })
        })
      })
    });
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};


function openDoc(req, res, next) {
  console.log('req body ', req.body);
  // {username, doc name}
  var user, doc, pullRequests;
  var text, commits, currentCommit;
  var repository;

  return User.findOne({ where: {username: req.body.username } })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('found user ');
    user = foundUser.dataValues;
    return Doc.findOne({ where: {name: req.body.docName, userID: user.id} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found doc');
    doc = foundDoc.dataValues; 
    return PullRequest.findAll({ where: {status: 'open', docName: req.body.docName, targetUsername: user.username} }) 
  })
  .then(function(foundPullRequests){
    pullRequests = foundPullRequests.map(instance => {
      return {
        docOwner: instance.dataValues.targetUsername, 
        username: instance.dataValues.requesterName, 
        docName: instance.dataValues.docName,  
        collaboratorMessage: instance.dataValues.collaboratorMessage, 
        mergeStatus: instance.dataValues.status, 
        commitID: instance.dataValues.commitId, 
        ownerMessage: ''
      }
    });
    console.log('found pull requests (if they exist)');
    return DocVersion.findAll({ where: {docId: doc.id} })
  })
  .then(function(foundCommits){
    commits = foundCommits.map((instance) => {
      return {
        id: instance.dataValues.id,
        commitID: instance.dataValues.commitID,
        commitMessage: instance.dataValues.commitMessage
      }
    });
    console.log('found commits');
    // console.log('reduced commits to send later ', commits);
    return NodeGit.Repository.open(doc.filepath)
  })
  .then(function(repo) {
    repository = repo;
    console.log('found repo');
    return NodeGit.Reference.nameToId(repository, 'HEAD')
  })
  .then(function(oid) {
    currentCommit = oid.tostrS();
    return fse.readFile(path.join(repository.workdir(), doc.name + '.txt'), 'utf8');
  })
  .then(function(data) {
    console.log('read contents ', data);
    text = data;
    var type = doc.public === true ? 'public' : 'private';
    console.log('confirm doctype');
    res.send({
      docID: doc.id,
      docOwner: user.username,
      docName: doc.name, 
      docDescription: doc.description,
      docType: type,
      parentID: doc.originId,
      originOwner: doc.originOwner,
      filePath: doc.filepath,
      docContent: text,
      docCommits: commits,
      currentCommit: currentCommit,
      pullRequests: pullRequests
    });
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};

function reviewUpstream(req, res, next) {
  console.log('req body ', req.body);
  // {username, doc name}
  var user, doc, upstreamDoc;
  var repository;
  var result = [];
  var obj = {};

  if (!req.user || !(req.user.username === req.body.username)) {
    console.log('You are not logged in at that username');
    return res.end('You are not logged in at that username');
  }

  return User.findOne({ where: {username: req.body.username } })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('found user ');
    user = foundUser.dataValues;
    return Doc.findOne({ where: {name: req.body.docName, userID: user.id} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found my doc');
    doc = foundDoc.dataValues; 
    return Doc.findOne({ where: {name: req.body.docName, id: doc.originId} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found upstream doc');
    upstreamDoc = foundDoc.dataValues; 
    // console.log('here they are ', doc, upstreamDoc);
    return fse.readFile(path.join(doc.filepath, doc.name + '.txt'), 'utf8')
  })
  .then(function(data) {
    obj.text1 = data;
    console.log('text 1 ', data);
    return fse.readFile(path.join(upstreamDoc.filepath, upstreamDoc.name + '.txt'), 'utf8')
  })
  .then(function(data) {
    obj.text2 = data;
    console.log('text 2 ', data);
    var diff = jsdiff.diffWordsWithSpace(obj.text1, obj.text2);

    diff.forEach(function(part){
      if (part.added) {
        result.push('<ins>');
      } else if (part.removed) {
        result.push('<del>');
      }

      result.push(part.value);

      if (part.added) {
        result.push('</ins>');
      } else if (part.removed) {
        result.push('</del>');
      }
    });

    console.log('result', result.join(''));
    result = result.join('');
    res.send({
      docContent: obj.text1,
      diffToolMergePreview: result
    });
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};

function getUpstream(req, res, next) {
  console.log('req body ', req.body);
  // {username, doc name}
  var user, doc, upstreamDoc, text;
  var repository, index, oid, comment, commitID, commits;

  if (!req.user || !(req.user.username === req.body.username)) {
    console.log('You are not logged in at that username');
    return res.end('You are not logged in at that username');
  }

  return User.findOne({ where: {username: req.body.username } })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('found user ');
    user = foundUser.dataValues;
    return Doc.findOne({ where: {name: req.body.docName, userID: user.id} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found my doc');
    doc = foundDoc.dataValues; 
    return Doc.findOne({ where: {name: req.body.docName, id: doc.originId} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found upstream doc');
    upstreamDoc = foundDoc.dataValues; 
    console.log('both filepaths ', doc.filepath, upstreamDoc.filepath);
    var fp = doc.filepath.split('');
    for (var i = 0; i < fp.length; i++) {
      // console.log(fp[i]);
      if (fp[i] === ' ') {
        // console.log('found a space');
        fp[i] = '\\\ ';
      }
    }
    // console.log('edited fp ', fp);
    fp = fp.join('');
    exec(`git --git-dir=${fp}/.git --work-tree=${fp}/ pull origin master`, (error, stdout, stderr) => {
      console.log(error, stdout, stderr);
      NodeGit.Repository.open(doc.filepath)
      .then(function(repo) {
        repository = repo;
        return repository.index();
      })
      .then(function(idx) {
        index = idx;
      })
      .then(function() {
        return index.addByPath(doc.name + '.txt');
      })
      .then(function() {
        return index.write();
      })
      .then(function() {
        return index.writeTree();
      })
      .then(function(oidResult) {
        oid = oidResult;
        return NodeGit.Reference.nameToId(repository, "HEAD");
      })
      .then(function(head) {
        return repository.getCommit(head);
      })
      .then(function(parent) {
        var who = NodeGit.Signature.now(user.username, user.email);
        comment = `Update from original at ${new Date().toLocaleString()}`;

        return repository.createCommit("HEAD", who, who, comment, oid, [parent]);
      })
      .then(function(commit) {
        console.log('successful commit ', commit);
        commitID = commit.tostrS();
        // console.log(commit.tostrS(), typeof commit.tostrS());
        DocVersion.build({
          commitID: commitID,
          commitMessage: comment,
          docId: doc.id,
          userId: user.id
        })
        .save()
        .then(function(madeDocVersion) {
          return fse.readFile(path.join(doc.filepath, doc.name + '.txt'), 'utf8');
        })
        .then(function(data) {
          console.log('read contents ', data);
          text = data;
          return DocVersion.findAll({ where: {docId: doc.id} })
        })
        .then(function(foundCommits) {
          commits = foundCommits.map((instance) => {
            return {
              id: instance.dataValues.id,
              commitID: instance.dataValues.commitID,
              commitMessage: instance.dataValues.commitMessage
            }
          });
          var type = doc.public === true ? 'public' : 'private';
          res.send({
            docOwner: user.username,
            docName: doc.name, 
            docDescription: doc.description,
            docType: type,
            parentID: doc.originId,
            originOwner: doc.originOwner,
            filePath: doc.filepath,
            docContent: text,
            docCommits: commits,
            currentCommit: commitID
          });
        })
      })
    });
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};

function validateMerge(req, res, next) { 
  console.log('req body ', req.body);
  // {username, docName, collaboratorMessage, commitID}
  var user, doc, upstreamDoc, upstreamUser, text, upstreamText;
  var repository, index, oid, comment, commitID;
  var pathToClonedRequester;
  var commit;

  PullRequest.findOne({ where: {commitId: req.body.commitID} }) 
  .then(function(pullRequestFound) {
    if (pullRequestFound) {
      if (pullRequestFound.dataValues.status === 'open') {
        console.log('Merge request still pending');
        return Promise.reject('Merge request still pending');
      } else if (pullRequestFound.dataValues.status === 'accept') {
        console.log('Merge request already accepted');
        return Promise.reject('Merge request already accepted');
      } else if (pullRequestFound.dataValues.status === 'decline') {
        console.log('Merge request already declined');
        return Promise.reject('Merge request already declined');
      }
    }
    console.log('no open pull requests')
    return DocVersion.findOne({ where: {commitID: req.body.commitID} })
  })
  .then(function(foundDocVersion){
    if (!foundDocVersion) {
      console.log('Commit doesn\'t exist');
      return Promise.reject('Commit doesn\'t exist');
    } 
    console.log('found commit');
    commit = foundDocVersion.dataValues;
    return User.findOne({ where: {id: commit.userId } })
  })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('found user ');
    user = foundUser.dataValues;
    if (!req.user || !(req.user.username === user.username)) {
      console.log('You are not logged in at that username');
      return Promise.reject('You are not logged in at that username');      
    }
    return Doc.findOne({ where: {id: commit.docId, userID: user.id} }) 
  })  
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found my doc');
    doc = foundDoc.dataValues; 
    return Doc.findOne({ where: {id: doc.originId} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found upstream doc');
    upstreamDoc = foundDoc.dataValues; 
    return User.findOne({ where: {id: upstreamDoc.userId } })
  })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('log: Can\'t find upstream user');
      return Promise.reject('User doesn\'t exist');
    }
    console.log('found upstream user ');
    upstreamUser = foundUser.dataValues;
    return fse.readFile(path.join(doc.filepath, doc.name + '.txt'), 'utf8')
  })
  .then(function(data) {
    // console.log('collaborator text ', data);
    text = data;
    return fse.readFile(path.join(upstreamDoc.filepath, upstreamDoc.name + '.txt'), 'utf8')
  })
  .then(function(data) {
    // console.log('upstream text ', data);
    upstreamText = data;
    if (text === upstreamText + '\n' || text === upstreamText) {
      console.log('no differences to merge')
      return res.end('Nothing new to merge');
    } else {
      res.send(true);
    }
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};


function requestMerge(req, res, next) { 
  console.log('req body ', req.body);
  // {username, docName, collaboratorMessage, commitID}
  var user, doc, upstreamDoc, upstreamUser, text, upstreamText;
  var repository, index, oid, comment, commitID;
  var pathToClonedRequester;

  if (!req.user || !(req.user.username === req.body.username)) {
    console.log('You are not logged in at that username');
    return Promise.reject('You are not logged in at that username');      
  }
  User.findOne({ where: {username: req.body.username } })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('found user ');
    user = foundUser.dataValues;
    return Doc.findOne({ where: {name: req.body.docName, userID: user.id} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found my doc');
    doc = foundDoc.dataValues; 
    return Doc.findOne({ where: {name: req.body.docName, id: doc.originId} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('Upstream doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found upstream doc');
    upstreamDoc = foundDoc.dataValues; 
    return User.findOne({ where: {id: upstreamDoc.userId } })
  })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('log: Can\'t find upstream user');
      return Promise.reject('User doesn\'t exist');
    }
    console.log('found upstream user ');
    upstreamUser = foundUser.dataValues;
    
    PullRequest.build({
      status: 'open',
      collaboratorMessage: req.body.collaboratorMessage,
      requesterName: user.username,
      requestingDocId: doc.id,
      targetUsername: upstreamUser.username,
      docName: doc.name,
      upstreamDocId: upstreamDoc.id,
      commitId: req.body.commitID
    })
    .save()
    .then(function(pullRequestEntry) {
      // console.log('Pull request added to database', pullRequestEntry);
      console.log('type ', typeof pullRequestEntry.id);
      var stringiFiedID = '' + pullRequestEntry.id;
      pathToClonedRequester = path.resolve(__dirname, 'pullRequests', stringiFiedID);
      return NodeGit.Clone(doc.filepath, pathToClonedRequester);
    })
    .then(function(repo) {
      return res.end('Pull request sent');
    })
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};


function reviewPullRequest(req, res, next) { 
  console.log('req body ', req.body);
  // {commitID}
  var user, doc, requestingDoc, pullRequest;
  var repository;
  var result = [];
  var obj = {};

  return PullRequest.findOne({ where: {commitId: req.body.commitID } })
  .then(function(foundPullRequest){
    if (!foundPullRequest) {
      console.log('pull request doesn\'t exist');
      return Promise.reject('Can\'t find that merge request');
    }
    console.log('found pull request ');
    pullRequest = foundPullRequest.dataValues;

    if (!req.user || !(req.user.username === pullRequest.targetUsername)) {
      console.log('You are not logged in at that username');
      return Promise.reject('You are not logged in at that username');      
    }

    return Doc.findOne({ where: {id: pullRequest.upstreamDocId} }) 
  })
  .then(function(foundUpstreamDoc){
    if (!foundUpstreamDoc) {
      console.log('original doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found upstreamDequest ');
    doc = foundUpstreamDoc.dataValues;
    return fse.readFile(path.join(doc.filepath, doc.name + '.txt'), 'utf8')
  })
  .then(function(data) {
    obj.text1 = data;
    console.log('text 1 ', data);
    var stringiFiedID = '' + pullRequest.id;
    return fse.readFile(path.join(__dirname, 'pullRequests', stringiFiedID, doc.name + '.txt'), 'utf8')
  })
  .then(function(data) {
    obj.text2 = data;
    console.log('text 2 ', data);
    var diff = jsdiff.diffWordsWithSpace(obj.text1, obj.text2);

    diff.forEach(function(part){
      if (part.added) {
        result.push('<ins>');
      } else if (part.removed) {
        result.push('<del>');
      }

      result.push(part.value);

      if (part.added) {
        result.push('</ins>');
      } else if (part.removed) {
        result.push('</del>');
      }
    });

    // console.log('result', result.join(''));
    result = result.join('');
    res.send({
      originContent: obj.text1,
      diffContent: result
    });
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};

function actionPullRequest(req, res, next) { 
  // commitID, ownerMessage, mergeStatus: 'accept/decline' 
  console.log('req body ', req.body);
  // {commitID}
  var user, upstreamDoc, requestingDoc, pullRequest, pullRequestInstance, text;
  var repository, index, oid, comment, commitID, commits;

  return PullRequest.findOne({ where: {commitId: req.body.commitID, status: 'open' } })
  .then(function(foundPullRequest){
    if (!foundPullRequest) {
      console.log('pull request doesn\'t exist');
      return Promise.reject('Can\'t find that merge request');
    }
    console.log('found pull request ');
    pullRequestInstance = foundPullRequest;
    pullRequest = foundPullRequest.dataValues;

    if (!req.user || !(req.user.username === pullRequest.targetUsername)) {
      console.log('You are not logged in at that username');
      return Promise.reject('You are not logged in at that username');      
    }

    // console.log(pullRequest);
    if (req.body.mergeStatus === 'decline') {
      return pullRequestInstance.updateAttributes({
        status: 'decline', 
        ownerMessage: req.body.ownerMessage
      })
    }
  })
  .then(function(){
    if (req.body.mergeStatus === 'decline') {
      console.log('Updated table for denial');
      return Promise.reject('Pull Request declined');
    }      
  })
  .then(function(){  
    return Doc.findOne({ where: {id: pullRequest.upstreamDocId} }) 
  })
  .then(function(foundUpstreamDoc){
    if (!foundUpstreamDoc) {
      console.log('original doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    console.log('found upstream doc');
    upstreamDoc = foundUpstreamDoc.dataValues;
    return User.findOne({ where: {username: pullRequest.targetUsername } })
  })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('foundUser');
    user = foundUser.dataValues;
    NodeGit.Repository.open(upstreamDoc.filepath)
    .then(function(repo) {
      console.log('opened repo');
      repository = repo;
      var stringiFiedID = '' + pullRequest.id;
      return fse.readFile(path.join(__dirname, 'pullRequests', stringiFiedID, upstreamDoc.name + '.txt'), 'utf8');
    }) 
    .then(function(data) {
      text = data;
      return fse.writeFile(path.join(repository.workdir(), upstreamDoc.name + '.txt'), text);
    })
    .then(function(){
      return repository.index();
    })
    .then(function(idx) {
      index = idx;
      return index.addByPath(upstreamDoc.name + '.txt');
    })
    .then(function(s) {
      return index.write();
    })
    .catch(function(e) {
      console.log('error',e)
    })
    .then(function() {
      return index.writeTree();
    })
    .then(function(oidResult) {
      oid = oidResult;
      return NodeGit.Reference.nameToId(repository, "HEAD");
    })
    .then(function(head) {
      return repository.getCommit(head);
    })
    .then(function(parent) {
      var who = NodeGit.Signature.now(user.username, user.email);
      comment = `Contribution from ${pullRequest.requesterName} at ${new Date().toLocaleString()}`;

      return repository.createCommit("HEAD", who, who, comment, oid, [parent]);
    })
    .then(function(commit) {
      console.log('successful commit ', commit);
      commitID = commit.tostrS();
      // console.log(commit.tostrS(), typeof commit.tostrS());
      DocVersion.build({
        commitID: commitID,
        commitMessage: comment,
        docId: upstreamDoc.id,
        userId: user.id
      })
      .save()
      .then(function(madeDocVersion) {
        // console.log('made another docVersion', madeDocVersion);
        return DocVersion.findAll({ where: {docId: upstreamDoc.id} })
      })
      .then(function(foundCommits) {
        // console.log('found all commits ', foundCommits);
        commits = foundCommits.map((instance) => {
          return {
            id: instance.dataValues.id,
            commitID: instance.dataValues.commitID,
            commitMessage: instance.dataValues.commitMessage
          }
        });
          pullRequestInstance.updateAttributes({
            status: 'accept', 
            ownerMessage: req.body.ownerMessage
          })
        .then(function(updatedPR) {
          console.log('PR status changed to accepted ');
          var type = upstreamDoc.public === true ? 'public' : 'private';
          res.send({
            docID: upstreamDoc.id,
            docOwner: user.username,
            docName: upstreamDoc.name, 
            docDescription: upstreamDoc.description,
            docType: type,
            parentID: upstreamDoc.originId,
            originOwner: upstreamDoc.originOwner,
            filePath: upstreamDoc.filepath,
            docContent: text,
            docCommits: commits,
            currentCommit: commitID
          });
        })
      })
    })  
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};

function pastVersion(req, res, next) {//commit ID, username, doc name
  console.log('req body ', req.body);
  var user, doc, docVersion;
  var commits, currentText;
  var repository;
  //take the commitID (SHA key)
  // path = path.resolve(__dirname, filesFolder, user.username, docName)

  DocVersion.findOne({ where: {commitID: req.body.commitID} })
  .then(function(foundDocVersion){
    if (!foundDocVersion) {
      console.log('commit doesn\'t exist');
      return Promise.reject('Commit doesn\'t exist');
    }
    console.log('found doc version');
    docVersion = foundDocVersion.dataValues;
    return User.findOne({ where: {id: foundDocVersion.userId} }) 
  })
  .then(function(foundUser){
    if (!foundUser) {
      console.log('user doesn\'t exist');
      return Promise.reject('User doesn\'t exist');
    } 
    console.log('found user ');
    user = foundUser.dataValues;
    if (!(req.user && req.user.username === user.username)) {
      console.log('You are not logged in at that username');
      return Promise.reject('You are not logged in at that username');      
    }
    return Doc.findOne({ where: {id: docVersion.docId} }) 
  })
  .then(function(foundDoc){
    if (!foundDoc) {
      console.log('doc doesn\'t exist');
      return Promise.reject('Can\'t find that doc');
    }
    // console.log('found doc', foundDoc.dataValues);
    doc = foundDoc.dataValues; 
    console.log('get commits');
    return DocVersion.findAll({ where: {docId: doc.id} })
  })
  .then(function(foundCommits){
    console.log('found commits ');
    commits = foundCommits.map((instance) => {
      return {
        id: instance.dataValues.id,
        commitID: instance.dataValues.commitID,
        commitMessage: instance.dataValues.commitMessage
      }
    });
    // console.log('reduced commits to send later ', commits);
    return NodeGit.Repository.open(path.resolve(__dirname, filesFolder, user.username, doc.name))
  })
  .then(function(repo) {
    repository = repo;
    console.log('found repo');
    return repository.getCommit(NodeGit.Oid.fromString(req.body.commitID))
  })
  .then(function(commit) {
    console.log('Got commit oid!');
    return NodeGit.Reset.reset(repository, commit, 3, {}, 'master')
  })
  .then(function(number) {
    console.log('Checkout done');
    return fse.readFile(path.join(repository.workdir(), doc.name + '.txt'), 'utf8');
  })
  .then(function(data) {
    currentText = data;
    console.log('checked out text :', currentText);
    var type = doc.public === true ? 'public' : 'private';
    res.send({
      docID: doc.id,
      docOwner: user.username,
      docName: doc.name, 
      docDescription: doc.description,
      docType: type,
      parentID: doc.originId,
      originOwner: doc.originOwner,
      filePath: doc.filepath,
      docContent: currentText,
      docCommits: commits,
      currentCommit: req.body.commitID
    });
  })
  .then(null, function(err){
    console.log('Error: ', err);
    res.end(err);
  })
};

export { specificDoc, allDocsForUser, allDocs, retrieveDocsAndPullRequests, createDoc, saveDoc, copyDoc, openDoc, reviewUpstream, getUpstream, validateMerge, requestMerge, reviewPullRequest, actionPullRequest, pastVersion };

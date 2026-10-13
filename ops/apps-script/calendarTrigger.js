/**
 * Starts the GitHub workflows that rebuild and check the AVCA website:
 *   onCalendarUpdated  deploy.yml  when the meeting calendar changes
 *   onDailyTick        deploy.yml  time-driven, daily (second clock besides GitHub's cron)
 *   onWeeklyLinkCheck  links.yml   time-driven, weekly
 *   testDispatch       deploy.yml  run by hand to confirm the token works
 * Each one starts its workflow on the main branch through the workflow-dispatch endpoint, exactly as
 * the "Run workflow" button does (the workflow's allow_degraded input keeps its default, false).
 *
 * GitHub disables scheduled workflows after 60 days without repository activity, and a disabled
 * workflow ignores every trigger, so each entry point first makes sure its workflow is active.
 *
 * Requires a script property named GITHUB_TOKEN (see README.md): a fine-grained token for this one
 * repository with a single permission, Actions (read and write). All three calls below need only that:
 *   GET  /actions/workflows/<file>             "Actions" repository permissions (read)
 *   PUT  /actions/workflows/<file>/enable      "Actions" repository permissions (write)
 *   POST /actions/workflows/<file>/dispatches  "Actions" repository permissions (write); 204 or 200
 * The token cannot read or write the repository's contents, so it cannot push to main.
 * Any unexpected response throws, so Google emails the trigger's owner.
 */
var REPO_API_ = 'https://api.github.com/repos/therealevanhenry/arlingtonview.org';

function request_(method, path, payload) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('Script property GITHUB_TOKEN is not set. See README.md.');
  }
  var options = {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    muteHttpExceptions: true
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  return UrlFetchApp.fetch(REPO_API_ + path, options);
}

// `expected` is one status code, or a list of acceptable ones.
function expect_(response, expected, what) {
  var code = response.getResponseCode();
  console.log(what + ' response code: ' + code);
  if ([].concat(expected).indexOf(code) === -1) {
    throw new Error(what + ' failed: HTTP ' + code + ' ' + response.getContentText().substring(0, 300));
  }
  return response;
}

function ensureActive_(workflowFile) {
  var path = '/actions/workflows/' + workflowFile;
  var workflow = JSON.parse(expect_(request_('get', path), 200, 'Get ' + workflowFile).getContentText());
  if (workflow.state !== 'active') {
    expect_(request_('put', path + '/enable'), 204, 'Enable ' + workflowFile);
    console.log('Re-enabled ' + workflowFile + '; previous state was ' + workflow.state);
  }
}

function dispatch_(workflowFile) {
  ensureActive_(workflowFile);
  // "Create a workflow dispatch event". 204 is the answer for the API version pinned in request_
  // (X-GitHub-Api-Version: 2022-11-28) with no return_run_details parameter: an empty body. The
  // 2026-03-10 API version answers 200 with the run's details instead. Both mean the run has started,
  // so both are accepted: a started run must not be reported (and emailed) as a failure. Whoever
  // raises the pinned version should still revisit the statuses passed to expect_ here.
  var path = '/actions/workflows/' + workflowFile + '/dispatches';
  expect_(request_('post', path, { ref: 'main' }), [204, 200], 'Start ' + workflowFile);
}

function onCalendarUpdated(e) {
  dispatch_('deploy.yml');
}

function onDailyTick() {
  dispatch_('deploy.yml');
}

function onWeeklyLinkCheck() {
  dispatch_('links.yml');
}

function testDispatch() {
  // Proves the token on every run. The enable call needs Actions (write); on an active workflow it
  // changes nothing. dispatch_ then reads the workflow's state (Actions, read) and starts a run
  // (Actions, write).
  expect_(request_('put', '/actions/workflows/deploy.yml/enable'), 204, 'Enable deploy.yml');
  dispatch_('deploy.yml');
}

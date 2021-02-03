#!/usr/bin/env bash
set -e -u -o pipefail

declare -r SCRIPT_DIR=$(cd -P $(dirname $0) && pwd)

declare -r NAMESPACE=${NAMESPACE:-pipelines-tutorial}

_log() {
    local level=$1; shift
    echo -e "$level: $@"
}

log.err() {
    _log "ERROR" "$@" >&2
}

info() {
    _log "\nINFO" "$@"
}

err() {
    local code=$1; shift
    local msg="$@"; shift
    log.err $msg
    exit $code
}

valid_command() {
  local fn=$1; shift
  [[ $(type -t "$fn") == "function" ]]
}

# helpers to avoid adding -n $NAMESPACE to oc and tkn
OC() {
  echo oc -n "$NAMESPACE" "$@"
  oc -n "$NAMESPACE" "$@"
}

TKN() {
 echo tkn -n "$NAMESPACE" "$@"
 tkn -n "$NAMESPACE" "$@"
}

demo.validate_tools() {
  info "validating tools"

  tkn version >/dev/null 2>&1 || err 1 "no tkn binary found"
  oc version  >/dev/null 2>&1 || err 1 "no oc binary found"
  return 0
}

demo.webhook-url(){
  local route=$(oc -n $NAMESPACE get route  -l eventlistener=vote-app -o name )
  local url=$(oc -n $NAMESPACE get $route --template='http://{{.spec.host}}')
  info "Webook URL: $url "
}

bootstrap() {
    demo.validate_tools

    info "ensure namespace $NAMESPACE exists"
    OC get ns "$NAMESPACE" 2>/dev/null  || {
      OC new-project $NAMESPACE
    }
  }

demo.setup-triggers() {
  local run_bootstrap=${1:-"run"}
  [[ "$run_bootstrap" == "skip-bootstrap" ]] || bootstrap

  info "Setup Triggers"
  OC apply -f 03_triggers/01_binding.yaml
  OC apply -f 03_triggers/03_trigger.yaml
  sed -e "s|pipelines-tutorial|$NAMESPACE|g" 03_triggers/02_template.yaml | OC apply -f -

  info "Setup Event Listener"
  OC apply -f 03_triggers/04_event_listener.yaml

  sleep 3
  info "Expose event listener"
  local el_svc=$(oc -n $NAMESPACE get svc -l eventlistener=vote-app -o name)
  OC expose $el_svc

  sleep 5
  demo.webhook-url
}


demo.setup-pipeline() {
  local run_bootstrap=${1:-"run"}
  [[ "$run_bootstrap" == "skip-bootstrap" ]] || bootstrap

  info "Apply pipeline tasks"
  OC apply -f 01_pipeline/01_apply_manifest_task.yaml
  OC apply -f 01_pipeline/02_update_deployment_task.yaml

  info "Creating workspace"
  OC apply -f 01_pipeline/03_persistent_volume_claim.yaml

  info "Applying pipeline"
  OC apply -f 01_pipeline/04_pipeline.yaml

  echo -e "\nPipeline"
  echo "==============="
  TKN p desc build-and-deploy

}

demo.setup() {
  bootstrap
  demo.setup-pipeline skip-bootstrap
  demo.setup-triggers skip-bootstrap
}

demo.logs() {
  TKN pipeline logs build-and-deploy --last -f
}

demo.run() {
  info "Running API Build and deploy"
  TKN pipeline start build-and-deploy \
    -w name=shared-workspace,volumeClaimTemplateFile=01_pipeline/03_persistent_volume_claim.yaml \
    -p deployment-name=vote-api \
    -p git-url=https://github.com/openshift-pipelines/vote-api.git \
    -p IMAGE=image-registry.openshift-image-registry.svc:5000/pipelines-tutorial/vote-api \
    --showlog=true

  info "Running UI Build and deploy"
  TKN pipeline start build-and-deploy \
    -w name=shared-workspace,volumeClaimTemplateFile=01_pipeline/03_persistent_volume_claim.yaml \
    -p deployment-name=vote-ui \
    -p git-url=https://github.com/openshift-pipelines/vote-ui.git \
    -p IMAGE=image-registry.openshift-image-registry.svc:5000/pipelines-tutorial/vote-ui \
    --showlog=true

  info "Validating the result of pipeline run"
  demo.validate_pipelinerun
}

demo.validate_pipelinerun() {
  local failed=0
  local results=( $(oc get pipelinerun.tekton.dev -n "$NAMESPACE" --template='
    {{range .items -}}
      {{ $pr := .metadata.name -}}
      {{ $c := index .status.conditions 0 -}}
      {{ $pr }}={{ $c.type }}{{ $c.status }}
    {{ end }}
    ') )

  for result in ${results[@]}; do
    if [[ ! "${result,,}" == *"=succeededtrue" ]]; then
      echo "ERROR: test $result but should be SucceededTrue"
      failed=1
    fi
  done

  return "$failed"
}

demo.url() {
  echo "Click following URL to access the application"
  oc -n "$NAMESPACE" get route vote-ui --template='http://{{.spec.host}} '
  echo
}


demo.help() {
# NOTE: must insert leading TABS and not SPACE to align
  cat <<-EOF
		USAGE:
		  demo [command]

		COMMANDS:
		  setup             runs both pipeline and trigger setup
		  setup-pipeline    sets up project, tasks, pipeline and workspace
		  setup-triggers    sets up  trigger, trigger-template, bindings, event-listener, expose webhook url
		  run               starts pipeline to deploy api, ui
		  webhook-url       provides the webhook url, which listens to github-event payloads
		  logs              shows logs of last pipelinerun
		  url               provides the url of the application
EOF
}

main() {
  local fn="demo.${1:-help}"
  valid_command "$fn" || {
    demo.help
    err  1 "invalid command '$1'"
  }

  cd "$SCRIPT_DIR"
  $fn "$@"
  return $?
}

main "$@"

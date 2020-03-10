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
  oc version --client >/dev/null 2>&1 || err 1 "no oc binary found"
  return 0
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

demo.setup() {
  demo.validate_tools

  info "ensure namespace $NAMESPACE exists"
  OC get ns "$NAMESPACE" 2>/dev/null  || {
    OC new-project "$NAMESPACE"
  }

  info "Apply pipeline tasks"
  OC apply -f pipeline/apply_manifest_task.yaml
  OC apply -f pipeline/update_deployment_task.yaml

  info "Applying resources"
  sed -e "s|pipelines-tutorial|$NAMESPACE|g" pipeline/resources.yaml | OC apply -f -
  
  info "Applying pipeline"
  OC apply -f pipeline/pipeline.yaml

  echo -e "\nPipeline"
  echo "==============="
  TKN p desc build-and-deploy
}

demo.logs() {
  TKN pipeline logs build-and-deploy --last -f
}

demo.run() {
  info "Starting the pipeline"
  TKN pipeline start build-and-deploy \
    -r api-repo=api-repo \
    -r api-image=api-image \
    -r ui-repo=ui-repo \
    -r ui-image=ui-image
  
  TKN pipeline logs -f --last

  info "Validating the result of pipeline run"
  demo.validate_pipelinerun
}

demo.url() {
  echo "Click following URL to access the application"
  oc -n "$NAMESPACE" get route ui --template='http://{{.spec.host}}'
  echo
}

demo.help() {
  cat <<-EOF
		USAGE:
		  demo [command]

		COMMANDS:
		  setup     setups project, tasks, pipeline and resources
		  run       starts pipeline
		  logs      show logs of last pipelinerun
		  url       provide the url of the application
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

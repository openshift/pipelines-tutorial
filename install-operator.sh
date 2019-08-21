#!/bin/bash

OPERATORS_NAMESPACE="openshift-operators"

set -ex

# Create a subscription
cat <<EOF | oc create -f -
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: openshift-pipelines-operator
  namespace: ${OPERATORS_NAMESPACE}
spec:
  channel: dev-preview
  installPlanApproval: Automatic
  name: openshift-pipelines-operator
  source: community-operators
  sourceNamespace: openshift-marketplace
  startingCSV: openshift-pipelines-operator.v0.5.2
EOF

echo "Give the pipeline operator some time to start..."

while [ "x" == "x$(oc get pods -l name=openshift-pipelines-operator -n ${OPERATORS_NAMESPACE} 2> /dev/null)" ]; do
    sleep 10
done

oc wait --for condition=ready pod -l name=openshift-pipelines-operator -n ${OPERATORS_NAMESPACE} --timeout=2400s

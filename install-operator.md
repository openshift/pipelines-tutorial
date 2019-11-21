# Install OpenShift Pipelines

OpenShift Pipelines is provided as an add-on on top of OpenShift that can be installed via an operator that is available in the OpenShift OperatorHub.

To start, make sure you are on the **Administrator** perspective as shown below:

![Administrator Perspective](images/administrator.png)

Go to **Operators > OperatorHub** in the Web Console. You can see the list of available operators for OpenShift provided by Red Hat as well as a community of partners and open-source projects.

![OpenShift OperatorHub](images/operatorhub.png)

In the search bar where it says `Filter by keyword...`, type OpenShift Pipelines to find the **OpenShift Pipelines Operator**:

![OpenShift OperatorHub](images/pipelines-operator.png)

Click on **OpenShift Pipelines Operator**, **Continue**, and then **Install**:

![OpenShift Pipelines Operator 1](images/operator-install-1.png)

Leave the default settings and click on **Subscribe** in order to subscribe to the installation and update channels:

![OpenShift Pipelines Operator 2](images/operator-install-2.png)

After clicking **Subscribe**, you will be taken to the **Installed Operators** page. If you do not see the **OpenShift Pipelines Operator** as shown below, simply wait a moment while the **OpenShift Pipelines Operator** finishes installation:

![OpenShift Pipelines Operator 3](images/operator-install-3.png)

Click on **OpenShift Pipelines Operator** under the `Name` column and then click on **Create Instance**:

![OpenShift Pipelines Operator 4](images/operator-install-4.png)

Leave the default values in the **Create Config** editor and click **Create**.

That's all. The operator now installs OpenShift Pipelines on the cluster.

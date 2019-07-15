# Build website
#
# Run from root level of repo, eg ./bin/quick-build.sh local-site.yml

# create nav.adoc
q -H -d , "SELECT prefix ||' xref::' ||slug||'.adoc[' ||navtext|| ']' FROM ./docs/arotna.csv" > ./docs/nav.adoc

# create files if necessary
mapfile -t file_array < <( q -H -d , "SELECT slug FROM ./docs/arotna.csv" )

for slug in "${file_array[@]}"
do
   file="./docs/pages/$slug.adoc"
   echo $file
   if [ ! -f $file ]; then
    echo "File not found!"
    ./bin/createFile.sh $slug $file

   fi
done


# create toc into _partials

q -H -d , "SELECT prefix ||' xref::' ||slug||'.adoc[' ||heading|| ']' FROM ./docs/arotna.csv" > ./docs/pages/_partials/toc.adoc

# create rendered assembly

echo ':toc:' > ./docs/master.adoc

echo 'include::pages/index.adoc[leveloffset=0,tags=!excludeDownstream]' >> ./docs/master.adoc

q -H -d , "SELECT 'include::pages/' ||slug||'.adoc[leveloffset='|| level ||']' FROM ./docs/arotna.csv" >> ./docs/master.adoc

# create single.adoc

./bin/asciidoc-coalescer.rb ./docs/master.adoc > ./docs/pages/single.adoc

# generate html

antora $1


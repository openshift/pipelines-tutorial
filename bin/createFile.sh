TEMPLATE=./docs/template.adoc
slug=$1
file=$2
export heading=$(q -H -d , "SELECT heading FROM ./docs/arotna.csv WHERE slug = '$slug'")

echo $heading
cat $TEMPLATE | sed -e s/{slug}/$slug/g | sed -e s/{heading}/"$heading"/g > $file
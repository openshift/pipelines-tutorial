# consider using preprocessor instead of this script

# until antora includes a feature that enables allow-uri-read for asciidoctor
# need to run this script to populate content from other repos

wget https://raw.githubusercontent.com/asciidoctor/asciidoctor-extensions-lab/master/scripts/asciidoc-coalescer.rb

find modules -type f -name '*.inc' |\
  while IFS= read -r inc_path
  do
    inc_dirname=$(dirname "${inc_path}")
    ruby asciidoc-coalescer.rb  -a allow-uri-read $inc_path > $inc_path-rantora.adoc
    
  done

rm asciidoc-coalescer.rb

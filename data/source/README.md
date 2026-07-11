# Vendored source data

These files are **verbatim copies** of scientific analysis outputs from the
[`urol-e5/deep-dive-expression`](https://github.com/urol-e5/deep-dive-expression)
repository (branch `main`), vendored here so the site build is reproducible
offline. **Do not edit these files by hand.** They are the inputs to the
preprocessing pipeline in [`scripts/build_web_data/`](../../scripts/build_web_data/).

To refresh them, re-run `npm run fetch:data` (downloads from GitHub raw) — see
[`docs/ADDING_DATA.md`](../../docs/ADDING_DATA.md).

| Local path | Source path in deep-dive-expression |
| --- | --- |
| `network/{Apul,Peve,Ptuh}_nodes_{p0.05,p0.01}.csv` | `M-multi-species/output/15-miRNA-mRNA-lncRNA-network-ceRNA/{sp}_nodes_miRNA_mRNA_lncRNA_ceRNA_network_{p}.csv` |
| `network/{Apul,Peve,Ptuh}_edges_{p0.05,p0.01}.csv` | `M-multi-species/output/15-miRNA-mRNA-lncRNA-network-ceRNA/{sp}_edges_miRNA_mRNA_lncRNA_ceRNA_network_{p}.csv` |
| `epimachinery/miRNAtargets_mach.csv` | `M-multi-species/output/12-miRNA-epimachinery/miRNAtargets_mach.csv` |
| `epimachinery/ncRNAepimachinery_gene_db_spec.csv` | `M-multi-species/output/09.1-epimachinery-ncRNA-protein-expression/ncRNAepimachinery_gene_db_spec.csv` |
| `epimachinery/ncRNA_machinery_reference_table.csv` | `data/ncRNA_machinery_reference_table.csv` |
| `interactions/miRanda_PCC_mRNA_sig.csv` | `M-multi-species/output/20-supplementary-files/miRanda_PCC_mRNA_sig.csv` |
| `interactions/miRanda_PCC_lncRNA_sig.csv` | `M-multi-species/output/20-supplementary-files/miRanda_PCC_lncRNA_sig.csv` |
| `methylation/{Apul,Peve,Ptuh}_global_methylation_levels.txt` | `{D-Apul/output/08-Apul-WGBS,E-Peve/output/12-Peve-WGBS,F-Ptuh/output/12-Ptuh-WGBS}/bismark_cutadapt/global_methylation_levels.txt` |

Species codes: `Apul` = *Acropora pulchra*, `Peve` = *Porites evermanni*,
`Ptuh` = *Pocillopora tuahiniensis*.

Retrieved 2026-07-10.

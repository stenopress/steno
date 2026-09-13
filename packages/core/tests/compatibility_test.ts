import { registerFrontmatterTests } from "../src/frontmatter_test.ts";
import { registerConfigValidationTests } from "../src/config_validation_test.ts";
import { registerHeadTests } from "../src/head_test.ts";
import { registerPathUtilsTests } from "../src/path_utils_test.ts";
import "../src/page_config_test.ts";
import "../src/text_test.ts";

registerFrontmatterTests();
registerConfigValidationTests();
registerHeadTests();
registerPathUtilsTests();

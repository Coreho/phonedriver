import { markdown } from "@/lib/content";
import { faqMd } from "@/lib/llms";

export const dynamic = "force-static";

export const GET = () => markdown(faqMd());

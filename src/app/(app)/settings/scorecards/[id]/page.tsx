import { notFound } from "next/navigation";
import { getScorecardTemplateDetail } from "@/lib/actions/scorecards";
import { EditScorecardTemplate } from "./edit-template";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditScorecardTemplatePage({ params }: Props) {
  const { id } = await params;
  const result = await getScorecardTemplateDetail(id);

  if ("error" in result || !result.data) {
    notFound();
  }

  return <EditScorecardTemplate template={result.data} />;
}

/** Actor entry-point selection for Alchemy Workbench.
 * A GM macro lists player characters, but a character/NPC sheet may explicitly
 * request its actor. Selection never bypasses Foundry ownership checks. */
export function allowedActor(actor,user){
 return Boolean(actor?.documentName==='Actor'&&
  (user?.isGM||actor?.testUserPermission?.(user,'OWNER')));
}
export function macroActors(all,user){
 return [...(all||[])].filter(actor=>
  allowedActor(actor,user)&&(!user?.isGM||actor.type==='character'))
  .sort((a,b)=>a.name.localeCompare(b.name));
}
export function preferredMacroActor(candidates,{controlled=[],character=null}={}){
 const available=new Map(candidates.map(actor=>[actor.id,actor]));
 for(const token of controlled){
  const actor=token?.actor;
  if(actor&&available.has(actor.id))return available.get(actor.id);
 }
 return character&&available.has(character.id)?available.get(character.id):null;
}
/** The actor-sheet entry point is explicit: NPCs are permitted, but must be
 * World Actors because server-side inventory transactions resolve game.actors.
 * Never silently redirect an unlinked-token inventory to its base NPC. */
export function resolveRequestedActor({actor=null,actorId=null}={},worldActors,user){
 if(actor==null&&actorId==null)return null;
 const requested=typeof actor==='string'?worldActors?.get?.(actor):
  actor??worldActors?.get?.(actorId);
 if(!requested||requested.documentName!=='Actor')
  throw new Error('Alchemy: Selected actor is not available.');
 if(requested.isToken||worldActors?.get?.(requested.id)!==requested)
  throw new Error('Alchemy: This actor is not a World Actor. Open the linked World Actor sheet to craft with its inventory.');
 if(!allowedActor(requested,user))
  throw new Error('Alchemy: You do not have permission to craft for this actor.');
 return requested;
}

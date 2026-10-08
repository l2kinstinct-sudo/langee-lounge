export type Team = {name: string; code: string; logoCode: string};
export const TEAMS: Team[] = [
 ['Arizona Cardinals','ARI'],['Atlanta Falcons','ATL'],['Baltimore Ravens','BAL'],['Buffalo Bills','BUF'],
 ['Carolina Panthers','CAR'],['Chicago Bears','CHI'],['Cincinnati Bengals','CIN'],['Cleveland Browns','CLE'],
 ['Dallas Cowboys','DAL'],['Denver Broncos','DEN'],['Detroit Lions','DET'],['Green Bay Packers','GB'],
 ['Houston Texans','HOU'],['Indianapolis Colts','IND'],['Jacksonville Jaguars','JAX'],['Kansas City Chiefs','KC'],
 ['Las Vegas Raiders','LV'],['Los Angeles Chargers','LAC'],['Los Angeles Rams','LAR'],['Miami Dolphins','MIA'],
 ['Minnesota Vikings','MIN'],['New England Patriots','NE'],['New Orleans Saints','NO'],['New York Giants','NYG'],
 ['New York Jets','NYJ'],['Philadelphia Eagles','PHI'],['Pittsburgh Steelers','PIT'],['San Francisco 49ers','SF'],
 ['Seattle Seahawks','SEA'],['Tampa Bay Buccaneers','TB'],['Tennessee Titans','TEN'],['Washington Commanders','WAS']
].map(([name,code]) => ({name,code,logoCode: code === 'WAS' ? 'wsh' : code.toLowerCase()}));
export const BY_CODE = Object.fromEntries(TEAMS.map(t => [t.code, t])) as Record<string, Team>;
export function logo(code: string) {return `https://a.espncdn.com/i/teamlogos/nfl/500/${BY_CODE[code]?.logoCode || 'nfl'}.png`;}
export type TeamAssignment = {userId: string; username: string};
export type BreakData = {id: string; name: string; status: 'current' | 'past'; scheduled_date: string | null; replay_url: string | null; created_at: string};
export type HitData = {id: string; name: string; image_url: string; team: string | null; customer: string | null; break_name: string | null; created_at: string};
export type LoungeState = {current: BreakData | null; breaks: BreakData[]; assignments: Record<string, TeamAssignment>; hits: HitData[]};

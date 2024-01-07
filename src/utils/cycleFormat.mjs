export default function CycleFormat(duration, cycle){
    if(duration === 1 || duration === "1"){
        switch (cycle) {
            case "week":
                return "Semana";
                break;
            
            case "month":
                return "Mês";
                break;
        }
    }else{
        switch (cycle) {
            case "week":
                return "Semanas";
                break;
            
            case "month":
                return "Meses";
                break;
        }
    }
}